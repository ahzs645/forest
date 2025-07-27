import { Certification, CertificationType } from "./gameModels.js";
import { askChoice, formatCurrency } from "./utils.js";

/**
 * Present certification opportunities to the player.
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 * @param {HTMLElement} terminal
 * @param {HTMLInputElement} input
 */
export async function certification_opportunities(state, write, terminal, input) {
  const available_certs = Object.values(CertificationType).filter(
    (cert_type) => !state.certifications.some((c) => c.cert_type === cert_type && c.active)
  );

  if (!available_certs.length) {
    return;
  }

  write("--- FOREST CERTIFICATION OPPORTUNITIES ---");
  write("Available certification programs:");

  const cert_info = {
    [CertificationType.FSC]: {
      name: "Forest Stewardship Council (FSC)",
      cost: 150000,
      annual: 25000,
      premium: 0.2,
      reputation: 0.15,
    },
    [CertificationType.PEFC]: {
      name: "Programme for Endorsement of Forest Certification (PEFC)",
      cost: 100000,
      annual: 18000,
      premium: 0.15,
      reputation: 0.1,
    },
    [CertificationType.SFI]: {
      name: "Sustainable Forestry Initiative (SFI)",
      cost: 80000,
      annual: 15000,
      premium: 0.12,
      reputation: 0.08,
    },
  };

  for (const cert_type of available_certs) {
    const info = cert_info[cert_type];
    write(`\n${info.name}`);
    write(`   Initial cost: ${formatCurrency(info.cost)}`);
  }

  const options = available_certs.map((cert) => `Apply for ${cert_info[cert].name}`);
  options.push("Skip certification");

  const choice = await askChoice("Choose certification program:", options, terminal, input);

  if (choice < available_certs.length) {
    const cert_type = available_certs[choice];
    const info = cert_info[cert_type];

    if (state.budget < info.cost) {
      write("Insufficient budget!");
      return;
    }

    if (check_certification_requirements(state, cert_type)) {
      state.budget -= info.cost;
      const certification = new Certification({
        cert_type: cert_type,
        obtained_year: state.year,
        annual_cost: info.annual,
        revenue_bonus: info.premium,
        reputation_bonus: info.reputation,
        active: true,
      });
      state.certifications.push(certification);
      state.reputation += info.reputation;
      write(`${info.name} certification obtained!`);
    } else {
      write(`Certification requirements not met for ${info.name}`);
    }
  }
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {CertificationType} cert_type
 */
function check_certification_requirements(state, cert_type) {
  if (cert_type === CertificationType.FSC) {
    return state.reputation >= 0.6 && state.biodiversity_score >= 0.5;
  } else if (cert_type === CertificationType.PEFC) {
    return state.reputation >= 0.4;
  } else if (cert_type === CertificationType.SFI) {
    return state.reputation >= 0.3;
  }
  return false;
}

/**
 * @param {import("./gameModels.js").GameState} state
 * @param {(text: string) => void} write
 */
export function maintain_certifications(state, write) {
  const active_certs = state.get_active_certifications();
  if (!active_certs.length) {
    return;
  }

  write("--- CERTIFICATION MAINTENANCE ---");
  const total_annual_cost = active_certs.reduce((sum, cert) => sum + cert.annual_cost, 0);
  write(`Total annual certification costs: ${formatCurrency(total_annual_cost)}`);

  if (state.budget < total_annual_cost) {
    write("Insufficient budget to maintain all certifications!");
    // Simplified: drop all certs
    for (const cert of active_certs) {
      cert.active = false;
    }
    state.reputation -= 0.3;
    return;
  }

  state.budget -= total_annual_cost;
  write("All certifications maintained.");

  for (const cert of active_certs) {
    if (!check_certification_requirements(state, cert.cert_type)) {
      write(`${cert.cert_type} audit found non-compliance issues.`);
      cert.active = false;
      state.reputation -= cert.reputation_bonus * 0.5;
    }
  }
}
