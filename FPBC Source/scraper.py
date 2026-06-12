"""
FPBC directory scraper.

Two stages:
  1. `directory` — walk https://fpbc.in1touch.org/site/registrant/directory?page=N
     and save every clientId + basic row info into `practitioners`.
  2. `profiles`  — for each practitioner, fetch the detail page and parse
     the "Limits, Conditions & Disciplinary Orders" accordion (#item5).
     Rows with real content are saved to `discipline_entries` and the
     practitioner's `has_discipline` flag is set.

Usage:
    python scraper.py directory                 # crawl all 510 pages
    python scraper.py directory --pages 1-5     # subset
    python scraper.py profiles                  # fetch every known clientId
    python scraper.py profiles --only-missing   # resume
    python scraper.py report                    # print practitioners with discipline
"""

from __future__ import annotations

import argparse
import csv
import logging
import re
import sqlite3
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Iterator
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag

HERE = Path(__file__).parent
DB_PATH = HERE / "fpbc.db"
SCHEMA_PATH = HERE / "schema.sql"

BASE = "https://fpbc.in1touch.org"
DIRECTORY_URL = f"{BASE}/site/registrant/directory"
DETAIL_PATH = "/client/roster/clientRosterDetails.html"

USER_AGENT = (
    "FPBC-Directory-Archiver/1.0 "
    "(research; contact: replace-with-your-email@example.com)"
)
DEFAULT_DELAY = 1.0
TIMEOUT = 20
MAX_RETRIES = 3

log = logging.getLogger("fpbc")


# ---------- db helpers ----------

def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA_PATH.read_text())
    return conn


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------- http ----------

def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-CA,en;q=0.9"})
    return s


def fetch(session: requests.Session, url: str, *, params: dict | None = None) -> str:
    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = session.get(url, params=params, timeout=TIMEOUT)
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            last_err = e
            backoff = 2 ** attempt
            log.warning("fetch %s failed (attempt %d/%d): %s — sleeping %ds",
                        url, attempt, MAX_RETRIES, e, backoff)
            time.sleep(backoff)
    raise RuntimeError(f"giving up on {url}: {last_err}")


# ---------- directory parsing ----------

@dataclass
class DirectoryRow:
    client_id: int
    client_roster_id: int | None
    name: str | None
    designation: str | None
    city: str | None
    status: str | None
    profile_url: str


CLIENT_ID_RE = re.compile(r"clientId=(\d+)")
ROSTER_ID_RE = re.compile(r"clientRosterId=(\d+)")


def parse_directory_page(html: str) -> list[DirectoryRow]:
    soup = BeautifulSoup(html, "lxml")
    rows: list[DirectoryRow] = []
    seen: set[int] = set()

    # Any <a> that points at the detail page is a practitioner link.
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "clientRosterDetails" not in href:
            continue
        cid_match = CLIENT_ID_RE.search(href)
        if not cid_match:
            continue
        client_id = int(cid_match.group(1))
        if client_id in seen:
            continue
        seen.add(client_id)

        rid_match = ROSTER_ID_RE.search(href)
        client_roster_id = int(rid_match.group(1)) if rid_match else None

        name = a.get_text(" ", strip=True) or None

        tr = a.find_parent("tr")
        designation = city = status = None
        if tr:
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            cells = [c for c in cells if c and c != name]
            if len(cells) >= 1:
                designation = cells[0]
            if len(cells) >= 2:
                city = cells[1]
            if len(cells) >= 3:
                status = cells[2]

        rows.append(DirectoryRow(
            client_id=client_id,
            client_roster_id=client_roster_id,
            name=name,
            designation=designation,
            city=city,
            status=status,
            profile_url=urljoin(BASE, href),
        ))
    return rows


def detect_total_pages(html: str) -> int | None:
    """Look for the pagebanner (e.g. '10195 found, displaying 1 to 20')."""
    soup = BeautifulSoup(html, "lxml")
    banner = soup.find("span", class_="pagebanner")
    if banner:
        m = re.search(r"([\d,]+)\s+(?:profiles|results|records)?\s*found", banner.get_text(" ", strip=True), re.I)
        if m:
            total = int(m.group(1).replace(",", ""))
            return (total + 19) // 20
    # Fallback: highest numeric link in the <ul class="pagination">
    nav = soup.find("ul", class_="pagination")
    if nav:
        nums = [int(t) for t in re.findall(r"\d+", nav.get_text(" ", strip=True))]
        if nums:
            return max(nums)
    return None


# ---------- profile parsing ----------

DISCIPLINE_HEADING_RE = re.compile(r"Limits.*Disciplinary", re.I)


@dataclass
class DisciplineEntry:
    section: str
    text_content: str | None
    link_text: str | None
    link_url: str | None


def _text_is_meaningful(text: str) -> bool:
    cleaned = text.replace("\xa0", " ").strip()
    return bool(cleaned)


def parse_discipline_section(html: str) -> list[DisciplineEntry]:
    soup = BeautifulSoup(html, "lxml")

    # Find the accordion whose header text matches "Limits... Disciplinary".
    target: Tag | None = None
    for header in soup.find_all(["h2", "h3", "button"]):
        if DISCIPLINE_HEADING_RE.search(header.get_text(" ", strip=True)):
            # Walk up to the .accordion-item then find its .accordion-body
            item = header.find_parent(class_="accordion-item") or header.find_parent("div")
            if item:
                target = item.find(class_="accordion-body")
                if target:
                    break

    if target is None:
        return []

    entries: list[DisciplineEntry] = []
    current_section = "Unknown"

    for node in target.children:
        if not isinstance(node, Tag):
            continue
        if node.name in ("h5", "h4", "strong"):
            heading = node.get_text(" ", strip=True)
            if heading:
                current_section = heading
            continue

        # Treat <p>, <div>, <ul> blocks as content for the current section.
        links = node.find_all("a", href=True)
        raw_text = node.get_text(" ", strip=True).replace("\xa0", " ").strip()

        if links:
            for a in links:
                link_text = a.get_text(" ", strip=True) or None
                link_url = urljoin(BASE, a["href"])
                # Skip totally empty anchors with no href text AND no surrounding text
                if not link_text and not _text_is_meaningful(raw_text):
                    continue
                entries.append(DisciplineEntry(
                    section=current_section,
                    text_content=raw_text or None,
                    link_text=link_text,
                    link_url=link_url,
                ))
        elif _text_is_meaningful(raw_text):
            entries.append(DisciplineEntry(
                section=current_section,
                text_content=raw_text,
                link_text=None,
                link_url=None,
            ))

    return entries


# ---------- stage 1: crawl directory ----------

def parse_page_range(spec: str | None, fallback_total: int) -> list[int]:
    if not spec:
        return list(range(1, fallback_total + 1))
    out: set[int] = set()
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if "-" in chunk:
            a, b = chunk.split("-", 1)
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(chunk))
    return sorted(out)


def cmd_directory(args: argparse.Namespace) -> None:
    session = make_session()
    conn = connect()

    log.info("fetching first page to detect total pages")
    first_html = fetch(session, DIRECTORY_URL, params={"page": 1})
    total = detect_total_pages(first_html) or 510
    log.info("total pages: %d", total)

    pages = parse_page_range(args.pages, total)
    log.info("will crawl %d pages", len(pages))

    for page in pages:
        if page == 1:
            html = first_html
        else:
            html = fetch(session, DIRECTORY_URL, params={"page": page})
            time.sleep(args.delay)

        rows = parse_directory_page(html)
        log.info("page %d: %d practitioners", page, len(rows))
        if not rows:
            log.warning("page %d had zero rows — structure may have changed", page)

        with conn:
            for r in rows:
                conn.execute(
                    """
                    INSERT INTO practitioners
                        (client_id, client_roster_id, name, designation, city,
                         status, profile_url, directory_page, directory_scraped_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(client_id) DO UPDATE SET
                        client_roster_id = excluded.client_roster_id,
                        name             = excluded.name,
                        designation      = excluded.designation,
                        city             = excluded.city,
                        status           = excluded.status,
                        profile_url      = excluded.profile_url,
                        directory_page   = excluded.directory_page,
                        directory_scraped_at = excluded.directory_scraped_at
                    """,
                    (r.client_id, r.client_roster_id, r.name, r.designation,
                     r.city, r.status, r.profile_url, page, now_iso()),
                )
    conn.close()


# ---------- stage 2: crawl profiles ----------

def iter_practitioners(conn: sqlite3.Connection, only_missing: bool) -> Iterator[sqlite3.Row]:
    if only_missing:
        q = "SELECT * FROM practitioners WHERE profile_scraped_at IS NULL ORDER BY client_id"
    else:
        q = "SELECT * FROM practitioners ORDER BY client_id"
    yield from conn.execute(q)


def cmd_profiles(args: argparse.Namespace) -> None:
    conn = connect()

    rows = list(iter_practitioners(conn, args.only_missing))
    if args.limit:
        rows = rows[: args.limit]
    total = len(rows)
    log.info("profiles to fetch: %d (workers=%d, per-worker delay=%.2fs)",
             total, args.workers, args.delay)

    tls = threading.local()

    def fetch_one(row: sqlite3.Row) -> tuple[sqlite3.Row, list[DisciplineEntry] | None, str | None]:
        s = getattr(tls, "session", None)
        if s is None:
            s = make_session()
            tls.session = s
        url = row["profile_url"] or f"{BASE}{DETAIL_PATH}"
        params = None
        if not row["profile_url"]:
            params = {"clientId": row["client_id"], "clientRosterId": row["client_roster_id"]}
        time.sleep(args.delay)
        try:
            html = fetch(s, url, params=params)
        except RuntimeError as e:
            return row, None, str(e)
        return row, parse_discipline_section(html), None

    processed = 0
    hits = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = [ex.submit(fetch_one, r) for r in rows]
        for fut in as_completed(futures):
            row, entries, err = fut.result()
            processed += 1
            if err is not None:
                log.error("skip client %s: %s", row["client_id"], err)
                continue

            ts = now_iso()
            with conn:
                conn.execute(
                    "DELETE FROM discipline_entries WHERE client_id = ?",
                    (row["client_id"],),
                )
                for e in entries or []:
                    conn.execute(
                        """
                        INSERT INTO discipline_entries
                            (client_id, section, text_content, link_text, link_url, scraped_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (row["client_id"], e.section, e.text_content, e.link_text, e.link_url, ts),
                    )
                conn.execute(
                    """
                    UPDATE practitioners
                       SET profile_scraped_at = ?, has_discipline = ?
                     WHERE client_id = ?
                    """,
                    (ts, 1 if entries else 0, row["client_id"]),
                )

            if entries:
                hits += 1
                log.info("[%d/%d] HIT client %s (%s) — %d entries",
                         processed, total, row["client_id"], row["name"], len(entries))
            elif processed % 100 == 0:
                rate = processed / max(1e-3, time.time() - t0)
                log.info("[%d/%d] %.1f req/s, %d hits so far", processed, total, rate, hits)

    log.info("done: %d processed, %d with discipline, %.1fs total",
             processed, hits, time.time() - t0)
    conn.close()


# ---------- stage 3: report ----------

def cmd_report(args: argparse.Namespace) -> None:
    conn = connect()
    rows = conn.execute(
        """
        SELECT p.client_id, p.name, p.designation, p.city, p.profile_url,
               COUNT(d.id) AS n_entries
          FROM practitioners p
          JOIN discipline_entries d ON d.client_id = p.client_id
         GROUP BY p.client_id
         ORDER BY p.name
        """
    ).fetchall()
    if not rows:
        print("No discipline entries found yet. Run `profiles` first.")
        return

    print(f"{len(rows)} practitioners with discipline entries\n")
    for r in rows:
        print(f"- {r['name']} ({r['designation'] or '?'}, {r['city'] or '?'}) "
              f"— {r['n_entries']} entr{'y' if r['n_entries']==1 else 'ies'}")
        print(f"  {r['profile_url']}")
        for e in conn.execute(
            "SELECT section, link_text, link_url, text_content FROM discipline_entries WHERE client_id = ?",
            (r["client_id"],),
        ):
            label = e["link_text"] or e["text_content"] or "(entry)"
            print(f"    • [{e['section']}] {label}")
            if e["link_url"]:
                print(f"        {e['link_url']}")
        print()

    conn.close()


# ---------- stage 4: download PDFs ----------

SKIP_URLS = {"https://www.fpbc.ca", "https://www.fpbc.ca/", "http://www.fpbc.ca"}


def _safe_filename(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_")
    return s[:120] or "file"


def cmd_download(args: argparse.Namespace) -> None:
    conn = connect()
    session = make_session()
    pdfs_dir = HERE / "pdfs"
    pdfs_dir.mkdir(exist_ok=True)

    rows = conn.execute(
        """
        SELECT d.client_id, p.name, d.section, d.link_text, d.link_url
          FROM discipline_entries d
          JOIN practitioners p ON p.client_id = d.client_id
         WHERE d.link_url IS NOT NULL AND d.link_url != ''
         ORDER BY p.name, d.id
        """
    ).fetchall()

    cache: dict[str, tuple[str, int, str, int]] = {}  # url -> (local, bytes, ct, status)
    manifest: list[dict] = []
    downloaded = 0
    skipped = 0
    errors = 0

    for r in rows:
        url = r["link_url"]
        entry = {
            "client_id": r["client_id"],
            "name": r["name"],
            "section": r["section"],
            "link_text": r["link_text"] or "",
            "url": url,
            "local_file": "",
            "bytes": 0,
            "content_type": "",
            "http_status": "",
            "note": "",
        }

        if url in SKIP_URLS:
            entry["note"] = "skipped: bare domain, not a document"
            skipped += 1
            manifest.append(entry)
            continue

        if url in cache:
            local, size, ct, status = cache[url]
            entry.update(local_file=local, bytes=size, content_type=ct, http_status=status,
                         note="deduped: already downloaded for another practitioner")
            manifest.append(entry)
            continue

        try:
            resp = session.get(url, timeout=45, allow_redirects=True)
            status = resp.status_code
            resp.raise_for_status()
        except requests.RequestException as e:
            log.error("fail %s: %s", url, e)
            entry["note"] = f"error: {e}"
            entry["http_status"] = getattr(e.response, "status_code", "") if getattr(e, "response", None) is not None else ""
            errors += 1
            manifest.append(entry)
            time.sleep(args.delay)
            continue

        ct = resp.headers.get("content-type", "").split(";")[0].strip().lower()

        parsed = urlparse(url)
        base = Path(parsed.path).name or _safe_filename(r["link_text"] or "file")
        local_name = f"{int(r['client_id']):05d}_{_safe_filename(base)}"
        lower_ct_ext = {"application/pdf": ".pdf", "text/html": ".html"}.get(ct)
        if lower_ct_ext and not local_name.lower().endswith(lower_ct_ext):
            local_name += lower_ct_ext

        local_path = pdfs_dir / local_name
        local_path.write_bytes(resp.content)
        size = len(resp.content)
        rel = str(local_path.relative_to(HERE))
        cache[url] = (rel, size, ct, status)
        entry.update(local_file=rel, bytes=size, content_type=ct, http_status=status)
        manifest.append(entry)
        downloaded += 1
        log.info("saved %s (%d bytes, %s)", local_name, size, ct)
        time.sleep(args.delay)

    manifest_path = HERE / "pdf_manifest.csv"
    with manifest_path.open("w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["client_id", "name", "section", "link_text", "url",
                        "local_file", "bytes", "content_type", "http_status", "note"],
        )
        w.writeheader()
        w.writerows(manifest)

    log.info("done: %d downloaded, %d deduped/skipped, %d errors — manifest at %s",
             downloaded, skipped + (len(manifest) - downloaded - errors - skipped),
             errors, manifest_path)
    conn.close()


# ---------- cli ----------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Scrape the FPBC public registrant directory.")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_dir = sub.add_parser("directory", help="crawl directory listing pages")
    p_dir.add_argument("--pages", help="subset like '1-5' or '1,3,7-10'")
    p_dir.add_argument("--delay", type=float, default=DEFAULT_DELAY)
    p_dir.set_defaults(func=cmd_directory)

    p_pro = sub.add_parser("profiles", help="fetch each practitioner detail page")
    p_pro.add_argument("--only-missing", action="store_true",
                       help="skip practitioners already fetched")
    p_pro.add_argument("--limit", type=int, help="stop after N profiles")
    p_pro.add_argument("--delay", type=float, default=0.4,
                       help="per-worker sleep between requests (default 0.4)")
    p_pro.add_argument("--workers", type=int, default=6,
                       help="concurrent fetcher threads (default 6)")
    p_pro.set_defaults(func=cmd_profiles)

    p_rep = sub.add_parser("report", help="print practitioners with discipline entries")
    p_rep.set_defaults(func=cmd_report)

    p_dl = sub.add_parser("download", help="download every unique discipline-entry URL to pdfs/")
    p_dl.add_argument("--delay", type=float, default=0.5)
    p_dl.set_defaults(func=cmd_download)

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
