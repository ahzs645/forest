#\!/bin/bash
# Responses for step-by-step game play
{
  echo "1"     # Select SBS region
  echo "2"     # Comprehensive stewardship plan
  echo "2"     # Full archaeological assessment
  echo "2"     # Normal pace
  echo "2"     # Moderate harvest schedule
  
  # For 8 quarters, provide quarterly responses
  for i in {1..8}; do
    echo "1"   # Quarterly activity (permits focus)
    echo "1"   # Continue operations
    echo "1"   # Yes to maintenance
    echo "1"   # Default choices for events
    echo "1"   
    echo "1"
    echo "1"
    echo "1"
  done
} | node cli.mjs --runs 1 --quarters 8 --profile balanced --step
