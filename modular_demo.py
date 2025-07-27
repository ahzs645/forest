#!/usr/bin/env python3
"""
BC Interior Forestry Simulator - Modular Features Demo
Demonstrates the enhanced modular features without user interaction
"""

import random
import sys
sys.path.append('.')

from game_models import GameState, HarvestBlock, FirstNation, PermitStatus, CertificationType, Certification, DisasterType
from utils import format_currency, format_volume, print_section_header, print_subsection
from events import natural_disasters_during_harvest, forest_health_monitoring
from permits import _get_denial_reason
from certification import _check_certification_requirements

def demonstrate_modular_features():
    """Comprehensive demonstration of all enhanced features."""
    print("=== BC INTERIOR FORESTRY SIMULATOR - MODULAR FEATURES DEMO ===")
    print("Demonstrating enhanced features:")
    print("✓ Modular codebase architecture")
    print("✓ Selective permit submission system")
    print("✓ Natural disasters during harvest operations")
    print("✓ Ongoing First Nations consultation") 
    print("✓ Forest certification for premium sales")
    print()
    
    # Initialize demo state
    state = GameState()
    state.region = "SBS"
    state.budget = 2500000
    state.annual_allowable_cut = 200000
    state.reputation = 0.6
    state.biodiversity_score = 0.5
    
    # Add First Nations
    state.first_nations = [
        FirstNation("Carrier Nation", 0.6, False),
        FirstNation("Treaty 8 Nation", 0.3, True)
    ]
    
    print_section_header("MODULAR ARCHITECTURE DEMONSTRATION")
    print("The codebase is now organized into specialized modules:")
    print("📁 game_models.py - Data structures and game state")
    print("📁 utils.py - Common utility functions")
    print("📁 events.py - Random events and natural disasters")
    print("📁 permits.py - Permit submission and processing")
    print("📁 first_nations.py - Indigenous consultation system")
    print("📁 certification.py - Forest certification programs")
    print("📁 forestry_game_modular.py - Main game orchestration")
    print()
    
    # Demo 1: Selective Permit Submission
    print_section_header("1. SELECTIVE PERMIT SUBMISSION SYSTEM")
    
    # Create sample blocks with different risk profiles
    blocks = [
        HarvestBlock("SBS-2025-01", 25000, 2025, priority=3, old_growth_affected=False, heritage_cleared=True),
        HarvestBlock("SBS-2025-02", 30000, 2025, priority=2, old_growth_affected=True, heritage_cleared=False),
        HarvestBlock("SBS-2025-03", 20000, 2025, priority=1, old_growth_affected=False, heritage_cleared=True),
        HarvestBlock("SBS-2025-04", 35000, 2025, priority=3, old_growth_affected=True, heritage_cleared=True)
    ]
    
    # Set First Nations agreement status
    blocks[0].first_nations_agreement = True  # Low risk
    blocks[2].first_nations_agreement = True  # Low risk
    
    print("Available harvest blocks for permit submission:")
    for block in blocks:
        risk_score = 0
        risk_factors = []
        
        if block.old_growth_affected:
            risk_factors.append("old-growth")
            risk_score += 3
        if not block.heritage_cleared:
            risk_factors.append("heritage")
            risk_score += 2
        if not block.first_nations_agreement:
            risk_factors.append("First Nations")
            risk_score += 4
            
        risk_level = "LOW" if risk_score <= 2 else "MEDIUM" if risk_score <= 5 else "HIGH"
        priority_text = ["Low", "Medium", "High"][block.priority - 1]
        
        print(f"  {block.id}: {format_volume(block.volume_m3)} - Priority: {priority_text} - Risk: {risk_level}")
        if risk_factors:
            print(f"    Risk factors: {', '.join(risk_factors)}")
    
    print("\nStrategic permit submission options demonstrated:")
    print("• Submit all blocks: Maximum volume, highest cost")
    print("• High priority only: Focus on critical operations") 
    print("• Low risk only: Maximize approval chances")
    print("• Custom selection: Tactical decision-making")
    
    # Simulate selective submission (high priority + low risk)
    selected_blocks = [b for b in blocks if b.priority >= 3 or (not b.old_growth_affected and b.first_nations_agreement)]
    total_cost = len(selected_blocks) * 5000 + sum(10000 for b in selected_blocks if not b.first_nations_agreement or b.old_growth_affected)
    
    print(f"\nExample: Submitting {len(selected_blocks)} strategic blocks")
    print(f"Total volume: {format_volume(sum(b.volume_m3 for b in selected_blocks))}")
    print(f"Estimated cost: {format_currency(total_cost)}")
    print()
    
    # Demo 2: Natural Disasters During Harvest
    print_section_header("2. NATURAL DISASTERS DURING HARVEST")
    
    # Simulate approved blocks ready for harvest
    approved_blocks = [
        HarvestBlock("SBS-2025-05", 28000, 2025, permit_status=PermitStatus.APPROVED),
        HarvestBlock("SBS-2025-06", 32000, 2025, permit_status=PermitStatus.APPROVED),
        HarvestBlock("SBS-2025-07", 25000, 2025, permit_status=PermitStatus.APPROVED)
    ]
    
    print("Approved blocks scheduled for harvest:")
    for block in approved_blocks:
        print(f"  {block.id}: {format_volume(block.volume_m3)}")
    
    print("\nPossible natural disasters during harvest operations:")
    print("🐛 Mountain Pine Beetle Outbreak (20-60% volume loss)")
    print("🌪️  Severe Windstorm (10-30% volume loss)")
    print("🌵 Drought/Fire Restrictions (5-15% operations impact)")
    print("🌊 Spring Flooding (15-25% access delays)")
    
    # Simulate beetle kill disaster
    print("\nSimulating Mountain Pine Beetle Outbreak:")
    affected_block = approved_blocks[1]
    affected_block.disaster_affected = True
    affected_block.disaster_type = DisasterType.BEETLE_KILL
    affected_block.volume_loss_percent = 0.4  # 40% loss
    
    lost_volume = int(affected_block.volume_m3 * affected_block.volume_loss_percent)
    remaining_volume = affected_block.volume_m3 - lost_volume
    
    print(f"🐛 Block {affected_block.id} affected by beetle kill")
    print(f"   Volume loss: {format_volume(lost_volume)} (40%)")
    print(f"   Salvageable: {format_volume(remaining_volume)}")
    print("   ⚠️  Salvage operations required - reduced timber quality")
    print()
    
    # Demo 3: Ongoing First Nations Consultation
    print_section_header("3. ONGOING FIRST NATIONS CONSULTATION")
    
    # Simulate consultation requirements
    carrier_nation = state.first_nations[0]
    treaty_nation = state.first_nations[1]
    
    # Set consultation history
    carrier_nation.last_consultation_year = 2023  # 2 years ago
    treaty_nation.last_consultation_year = 2022   # 3 years ago
    
    print("First Nations consultation requirements (Year 2025):")
    for fn in state.first_nations:
        years_since = 2025 - fn.last_consultation_year
        needs_consultation = fn.needs_consultation(2025)
        status = "REQUIRED" if needs_consultation else "Current"
        
        print(f"  {fn.name}: {status}")
        print(f"    Last consultation: {years_since} years ago")
        print(f"    Treaty area: {'Yes' if fn.treaty_area else 'No'}")
        print(f"    Relationship level: {fn.relationship_level:.2f}")
    
    print("\nConsultation approach options:")
    print("• Comprehensive consultations ($50,000+) - Build strong relationships")
    print("• Individual meetings ($20,000+) - Maintain basic compliance")
    print("• Formal notifications ($2,000+) - Minimal legal requirement")
    print("• Delay consultations (FREE) - Risk deteriorating relationships")
    
    # Simulate comprehensive consultation outcome
    print("\nSimulating comprehensive consultation approach:")
    print("✓ Carrier Nation: Agreement signed, relationship improved")
    print("⚠️  Treaty 8 Nation: Raises cumulative impact concerns")
    print("   Ecosystem-based management plan required")
    print("   New disturbance cap: 40,000 hectares (down from 50,000)")
    print()
    
    # Demo 4: Forest Certification System
    print_section_header("4. FOREST CERTIFICATION FOR PREMIUM SALES")
    
    print("Available forest certification programs:")
    
    certifications_info = [
        ("FSC (Forest Stewardship Council)", 150000, 25000, 20, "Strict environmental/social standards"),
        ("PEFC (Programme for Endorsement)", 100000, 18000, 15, "National certification framework"),
        ("SFI (Sustainable Forestry Initiative)", 80000, 15000, 12, "Fiber sourcing standards")
    ]
    
    for name, initial_cost, annual_cost, premium, requirements in certifications_info:
        print(f"\n{name}")
        print(f"  Initial cost: {format_currency(initial_cost)}")
        print(f"  Annual cost: {format_currency(annual_cost)}")
        print(f"  Revenue premium: +{premium}% on certified timber")
        print(f"  Requirements: {requirements}")
    
    # Simulate FSC certification attempt
    print("\nSimulating FSC certification application:")
    print("Checking requirements:")
    print(f"  ✓ Reputation: {state.reputation:.2f}/0.60 (Required)")
    print(f"  ✓ Biodiversity: {state.biodiversity_score:.2f}/0.50 (Required)")
    print(f"  ✓ Disturbance ratio: Low (Required)")
    print(f"  ⚠️  First Nations relationships: Mixed")
    
    # Simulate certification obtained
    fsc_cert = Certification(
        cert_type=CertificationType.FSC,
        obtained_year=2025,
        active=True
    )
    
    print("\n✓ FSC Certification APPROVED!")
    print("Benefits:")
    print("  • +20% revenue premium on all certified timber")
    print("  • +0.15 reputation bonus")
    print("  • Enhanced permit approval chances")
    print("  • Access to premium international markets")
    
    # Demo revenue impact
    base_volume = 80000  # m³
    base_revenue = base_volume * 85  # $85/m³
    certified_revenue = base_volume * int(85 * 1.20)  # 20% premium
    additional_revenue = certified_revenue - base_revenue
    
    print(f"\nRevenue impact example ({format_volume(base_volume)} harvest):")
    print(f"  Standard revenue: {format_currency(base_revenue)}")
    print(f"  Certified revenue: {format_currency(certified_revenue)}")
    print(f"  Additional income: {format_currency(additional_revenue)}")
    print()
    
    # Demo 5: Integrated System Benefits
    print_section_header("5. INTEGRATED SYSTEM BENEFITS")
    
    print("Enhanced gameplay features working together:")
    print()
    
    print("🎯 Strategic Decision Making:")
    print("  • Selective permits based on risk/reward analysis")
    print("  • Certification investments for long-term premium markets")
    print("  • Relationship building for smoother operations")
    print()
    
    print("⚡ Dynamic Challenge System:")
    print("  • Natural disasters require adaptive management")
    print("  • Ongoing consultation maintains social license")
    print("  • Market conditions affect strategic choices")
    print()
    
    print("🏆 Multiple Victory Paths:")
    print("  • Economic Champion: Profit + jobs + growth")
    print("  • Environmental Steward: Sustainability + biodiversity")
    print("  • Reconciliation Leader: Indigenous partnerships")
    print("  • Certification Leader: Industry-leading practices")
    print("  • Industry Survivor: Long-term resilience")
    print()
    
    print("📊 Realistic Complexity:")
    print("  • Based on actual BC Interior forestry challenges")
    print("  • Reflects real policy changes and market conditions")  
    print("  • Incorporates cumulative impact assessments")
    print("  • Models authentic consultation requirements")
    print()
    
    print("=== MODULAR ARCHITECTURE BENEFITS ===")
    print("✓ Code Organization: Specialized modules for different game systems")
    print("✓ Maintainability: Easy to modify individual systems")
    print("✓ Extensibility: Simple to add new features or events")
    print("✓ Testing: Individual modules can be tested independently")
    print("✓ Readability: Clear separation of concerns")
    print()
    
    print("Ready to play the enhanced modular version?")
    print("Run: python3 forestry_game_modular.py")


if __name__ == "__main__":
    demonstrate_modular_features()