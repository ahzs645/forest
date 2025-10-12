#!/bin/bash
# Quick helper to run a single automated simulation with verbose logging.

ROLE="${1:-planner}"
AREA="${2:-cariboo}"

node cli.mjs --runs 1 --rounds 4 --role "$ROLE" --area "$AREA" --log
