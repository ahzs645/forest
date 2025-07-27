#!/usr/bin/env python3
"""
BC Interior Forestry Simulator - Demo Version
Showcases the enhanced game features and mechanics
"""

import random
from forestry_game import GameState, PermitStatus, FirstNation, HarvestBlock

def demo_game():
    """Demonstrates the enhanced game features without user interaction."""
    print("=== BC INTERIOR FORESTRY SIMULATOR - DEMO ===")
    print("This demo showcases the enhanced features based on BC Interior forestry context.")
    print()
    
    # Initialize game state
    state = GameState()
    state.region = "SBS"  # Sub-Boreal Spruce region
    state.annual_allowable_cut = 200000
    state.aac_decline_rate = 0.05
    
    # Add First Nations
    state.first_nations = [
        FirstNation("Carrier Nation", 0.6, False),
        FirstNation("Treaty 8 Nation", 0.3, True)  # Treaty area with special requirements
    ]
    
    print("COMPANY: Northern Forest Solutions")
    print("REGION: Sub-Boreal Spruce (SBS)")
    print(f"STARTING BUDGET: ${state.budget:,}")
    print(f"ANNUAL ALLOWABLE CUT: {state.annual_allowable_cut:,} m³")
    print()
    
    # Demo Year 1: Planning and Permitting
    print("=== YEAR 1: PLANNING AND PERMIT APPLICATIONS ===")
    
    # Create harvest blocks
    planned_volume = 120000  # 60% of AAC capacity
    for i in range(5):
        block = HarvestBlock(
            id=f"SBS-2025-{i+1:02d}",
            volume_m3=planned_volume // 5,
            year_planned=2025,
            old_growth_affected=(i == 2)  # Block 3 has old-growth concerns
        )
        state.harvest_blocks.append(block)
    
    print(f"✓ Created 5 harvest blocks totaling {planned_volume:,} m³")
    print("✓ Conducted comprehensive First Nations consultations ($50,000)")
    print("✓ Submitted detailed Forest Stewardship Plan ($30,000)")
    print("✓ Applied for all harvest permits ($25,000)")
    
    state.budget -= 105000
    state.reputation = 0.7  # Good reputation from thorough consultation
    
    # Set permit processing times
    for i, block in enumerate(state.harvest_blocks):
        block.permit_submitted = 2025
        if block.old_growth_affected:
            block.processing_time = 180  # Longer for old-growth review
        else:
            block.processing_time = 120  # Standard backlog
    
    print(f"Budget after Year 1: ${state.budget:,}")
    print(f"Reputation: {state.reputation:.2f}/1.0")
    print()
    
    # Demo Year 2: Policy Changes and Permit Decisions
    print("=== YEAR 2: PERMIT DECISIONS AND POLICY CHANGES ===")
    
    # Random policy event
    print("🏛️  GOVERNMENT ANNOUNCEMENT: Additional old-growth deferrals implemented")
    print("   Block SBS-2025-03 cancelled due to old-growth deferral")
    state.old_growth_deferrals_expanded = True
    
    # Remove old-growth block
    old_growth_block = next(b for b in state.harvest_blocks if b.old_growth_affected)
    state.harvest_blocks.remove(old_growth_block)
    
    # Approve remaining permits
    approved_volume = 0
    for block in state.harvest_blocks:
        block.permit_status = PermitStatus.APPROVED
        approved_volume += block.volume_m3
        print(f"✓ APPROVED: {block.id}")
    
    print(f"Total approved volume: {approved_volume:,} m³")
    print()
    
    # Demo Year 2: Harvest Operations
    print("=== YEAR 2: HARVEST OPERATIONS ===")
    
    # Calculate economics
    revenue = approved_volume * 85  # $85/m³
    costs = approved_volume * 45    # $45/m³
    net_profit = revenue - costs
    
    print(f"☀️  Good weather - operations proceed smoothly")
    print(f"Revenue: ${revenue:,.0f}")
    print(f"Costs: ${costs:,.0f}")
    print(f"Net profit: ${net_profit:,.0f}")
    
    state.budget += net_profit
    state.total_revenue += revenue
    state.jobs_created = approved_volume // 1000  # ~1 job per 1000 m³
    
    print(f"Jobs created: {state.jobs_created}")
    print(f"Budget after harvest: ${state.budget:,}")
    print()
    
    # Demo Year 3: Declining AAC and Challenges
    print("=== YEAR 3: AAC DECLINE AND NEW CHALLENGES ===")
    
    # AAC decline due to beetle kill
    old_aac = state.annual_allowable_cut
    state.annual_allowable_cut = int(state.annual_allowable_cut * 0.95)
    print(f"AAC declining: {old_aac:,} → {state.annual_allowable_cut:,} m³ (-5.0%)")
    
    # Wildfire event
    print("⚡ WILDFIRE SEASON: Major fires affect timber supply")
    print("   Government fast-tracks salvage permits (25-day timeline)")
    state.permit_backlog_days = 25
    
    # Court ruling
    print("⚖️  COURT RULING: First Nations win land rights case")
    print("   Treaty 8 Nation requires enhanced consultation process")
    
    # Show cumulative impacts
    state.cumulative_disturbance = approved_volume * 0.01
    print(f"Cumulative disturbance: {state.cumulative_disturbance:,.0f}/{state.disturbance_cap:,.0f} ha")
    print()
    
    # Demo: Win Condition Tracking
    print("=== WIN CONDITION PROGRESS ===")
    state.consecutive_profitable_years = 2
    state.years_operated = 3
    
    print("🎯 Economic Sustainability:")
    print(f"   Consecutive profitable years: {state.consecutive_profitable_years}/5")
    print(f"   Budget target: ${state.budget:,}/3,000,000")
    print(f"   Jobs created: {state.jobs_created}/200")
    
    print("🌲 Environmental Stewardship:")
    print(f"   Reputation: {state.reputation:.2f}/0.8")
    print(f"   Disturbance ratio: {state.cumulative_disturbance/state.disturbance_cap:.1%}/60%")
    
    print("🤝 Indigenous Reconciliation:")
    for fn in state.first_nations:
        status = "✓" if fn.agreement_signed else "✗"
        print(f"   {fn.name}: {status} (relationship: {fn.relationship_level:.2f})")
    
    print("🏭 Industry Survival:")
    print(f"   Years operated: {state.years_operated}/10")
    print(f"   Financial sustainability: {'✓' if state.budget > 500000 else '✗'}")
    print()
    
    # Demo: Game Features Summary
    print("=== ENHANCED GAME FEATURES DEMONSTRATED ===")
    print("✓ Multi-year harvest scheduling with declining AAC")
    print("✓ Realistic permit delays and government backlogs")
    print("✓ First Nations consultation and Treaty rights (Blueberry River model)")
    print("✓ Dynamic policy changes (old-growth deferrals, glyphosate bans)")
    print("✓ Economic tracking with revenue, costs, and job creation")
    print("✓ Random events (wildfires, court rulings, policy changes)")
    print("✓ Cumulative disturbance caps and environmental limits")
    print("✓ Multiple win conditions (economic, environmental, reconciliation, survival)")
    print("✓ Complex decision-making with long-term consequences")
    print()
    
    print("The enhanced game now provides:")
    print("• 15-year simulation with realistic BC Interior challenges")
    print("• Multiple pathways to victory based on different priorities")
    print("• Authentic regulatory and consultation requirements")
    print("• Economic pressures reflecting real industry conditions")
    print("• Meaningful choices with trade-offs and consequences")
    print()
    print("Ready to play the full interactive version? Run: python3 forestry_game.py")

if __name__ == "__main__":
    demo_game()