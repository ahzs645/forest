#!/usr/bin/env python3
"""
BC Interior Forestry Simulator - Modular Version
Enhanced with selective permits, natural disasters, ongoing FN consultation, and certification
"""

import random
from typing import Tuple
from game_models import GameState, HarvestBlock, FirstNation, PermitStatus, CertificationType
from utils import ask, print_section_header, print_subsection, format_currency, format_volume
from events import random_policy_events, natural_disasters_during_harvest, forest_health_monitoring, market_fluctuations
from permits import selective_permit_submission, process_permits
from first_nations import ongoing_first_nations_consultation, build_relationships_action
from certification import certification_opportunities, maintain_certifications
from illegal_activities_enhanced import enhanced_illegal_opportunities, ongoing_criminal_consequences
from wacky_events import quarterly_wacky_events
from liaison import liaison_management
from ceo_system import ceo_management, ceo_automated_decisions, pay_ceo_annual_costs, ceo_quarterly_report
from first_nations_anger import random_first_nations_anger_events, check_anger_event_triggers
from workplace_safety import workplace_safety_incidents, ongoing_safety_consequences, workplace_safety_audit

# Game Configuration Flags
ENABLE_WACKY_EVENTS = False  # Set to True to enable bizarre quarterly events


def choose_region(state: GameState):
    """Initial region selection with region-specific setup."""
    idx = ask("Where will you operate?", [
        "Sub-Boreal Spruce (SBS) - High AAC, declining fast due to beetle kill",
        "Interior Douglas-fir (IDF) - Moderate AAC, wildfire risk",
        "Montane Spruce (MS) - Lower AAC, complex First Nations territories"
    ])
    
    regions = ["SBS", "IDF", "MS"]
    state.region = regions[idx]
    
    # Set region-specific parameters
    if idx == 0:  # SBS
        state.annual_allowable_cut = 200000
        state.aac_decline_rate = 0.05
        state.first_nations.extend([
            FirstNation("Carrier Nation", 0.6, False),
            FirstNation("Takla Nation", 0.4, False)
        ])
    elif idx == 1:  # IDF
        state.annual_allowable_cut = 120000
        state.aac_decline_rate = 0.025
        state.first_nations.extend([
            FirstNation("Secwepemc Nation", 0.5, True),
            FirstNation("Okanagan Nation", 0.3, True)
        ])
    else:  # MS
        state.annual_allowable_cut = 80000
        state.aac_decline_rate = 0.02
        state.disturbance_cap = 30000
        state.first_nations.extend([
            FirstNation("Treaty 8 Nation", 0.3, True),
            FirstNation("Kaska Nation", 0.4, False)
        ])


def initial_setup(state: GameState):
    """Initial company setup and planning decisions."""
    print_subsection("INITIAL COMPANY SETUP")
    
    # Forest Stewardship Plan
    idx = ask("How detailed will your Forest Stewardship Plan be?", [
        "Minimal plan (cheaper, less commitment)",
        "Comprehensive plan with ecosystem commitments"
    ])
    
    if idx == 0:
        state.budget -= 10000
        state.reputation -= 0.1
    else:
        state.budget -= 30000
        state.reputation += 0.1
        state.permit_bonus += 0.05
    
    # Heritage Assessment with detailed cost explanations
    print("\n📜 Archaeological Assessment Requirements:")
    print("BC has 64,000+ heritage sites (90% are First Nations origin)")
    print("Heritage assessments can significantly delay permit processing")
    
    idx = ask("Archaeological assessments under the Heritage Conservation Act?", [
        "Minimal survey ($5,000) - Basic legal compliance, high permit delay risk",
        "Full assessment ($15,000) - Thorough survey, faster permit processing"
    ])
    
    if idx == 0:
        state.budget -= 5000
        state.reputation -= 0.05
        state.permit_bonus -= 0.1
        print("⚠️  Choosing minimal survey increases permit processing time by 30+ days")
        print("💰 Cost: $5,000 | 📉 Reputation: -0.05 | ⏱️  Permit delays likely")
        # Mark blocks as not heritage cleared
        for block in state.harvest_blocks:
            block.heritage_cleared = False
    else:
        state.budget -= 15000
        state.reputation += 0.05
        state.permit_bonus += 0.05
        print("✅ Thorough assessment reduces permit risks and shows cultural respect")
        print("💰 Cost: $15,000 | 📈 Reputation: +0.05 | ⚡ Faster permits")
        # Mark blocks as heritage cleared
        for block in state.harvest_blocks:
            block.heritage_cleared = True


def plan_harvest_schedule(state: GameState):
    """Annual harvest planning with block prioritization."""
    print_subsection(f"HARVEST PLANNING (Year {state.year})")
    print(f"Current Annual Allowable Cut: {format_volume(state.annual_allowable_cut)}")
    print(f"Your mill capacity: {format_volume(state.mill_capacity)}/year")
    
    available_cut = min(state.annual_allowable_cut, state.mill_capacity)
    
    idx = ask(f"How much volume do you want to schedule for harvest?", [
        f"Conservative: {format_volume(int(available_cut * 0.6))} (60% of capacity)",
        f"Moderate: {format_volume(int(available_cut * 0.8))} (80% of capacity)",
        f"Aggressive: {format_volume(available_cut)} (100% of capacity)"
    ])
    
    volumes = [int(available_cut * 0.6), int(available_cut * 0.8), available_cut]
    planned_volume = volumes[idx]
    
    # Create harvest blocks with variable sizes
    new_blocks = []
    remaining_volume = planned_volume
    block_count = 0
    
    # Generate blocks until we've allocated all volume
    while remaining_volume > 0 and block_count < 20:  # Max 20 blocks to prevent infinite loops
        block_count += 1
        
        # If remaining volume is very small, just create one final block
        if remaining_volume < 5000:
            target_size = remaining_volume
            size_category = "tiny"
        else:
            # Randomly determine block size category based on remaining volume
            if remaining_volume < 12000:
                size_category = "tiny"
            elif remaining_volume < 25000:
                size_category = random.choices(["tiny", "small"], weights=[30, 70], k=1)[0]
            elif remaining_volume < 45000:
                size_category = random.choices(["tiny", "small", "medium"], weights=[10, 40, 50], k=1)[0]
            elif remaining_volume < 80000:
                size_category = random.choices(["small", "medium", "large"], weights=[20, 50, 30], k=1)[0]
            else:
                size_category = random.choices(["medium", "large", "massive"], weights=[30, 50, 20], k=1)[0]
            
            # Define size ranges for each category
            size_ranges = {
                "tiny": (3000, 12000),      # 3K-12K m³
                "small": (12000, 25000),    # 12K-25K m³  
                "medium": (25000, 45000),   # 25K-45K m³
                "large": (45000, 80000),    # 45K-80K m³
                "massive": (80000, 150000)  # 80K-150K m³ (rare old-growth giants)
            }
            
            min_size, max_size = size_ranges[size_category]
            
            # Ensure we don't create invalid ranges
            if remaining_volume <= min_size:
                target_size = remaining_volume
            else:
                # Ensure target size doesn't exceed remaining volume
                effective_max = min(max_size, remaining_volume)
                target_size = random.randint(min_size, effective_max)
        
        # Assign characteristics based on block size
        if size_category == "massive":
            priority = 3  # Massive blocks are always high priority
            old_growth_risk = 0.8  # High chance of old-growth
        elif size_category == "large":
            priority = random.choice([2, 3])
            old_growth_risk = 0.5
        elif size_category == "medium":
            priority = random.choice([1, 2, 3])
            old_growth_risk = 0.3
        else:  # small/tiny
            priority = random.choice([1, 2])
            old_growth_risk = 0.1
        
        block = HarvestBlock(
            id=f"{state.region}-{state.year}Q{state.quarter}-{block_count:02d}",
            volume_m3=target_size,
            year_planned=state.year,
            old_growth_affected=random.random() < old_growth_risk,
            priority=priority
        )
        
        new_blocks.append(block)
        state.harvest_blocks.append(block)
        remaining_volume -= target_size
    
    actual_volume = sum(block.volume_m3 for block in new_blocks)
    print(f"\nCreated {len(new_blocks)} harvest blocks totaling {format_volume(actual_volume)}")
    
    # Show block details with size categories
    for block in new_blocks:
        # Determine size category for display
        volume = block.volume_m3
        if volume >= 80000:
            size_emoji = "🏔️"
            size_text = "MASSIVE"
        elif volume >= 45000:
            size_emoji = "⛰️"
            size_text = "Large"
        elif volume >= 25000:
            size_emoji = "🏞️"
            size_text = "Medium"
        elif volume >= 12000:
            size_emoji = "🌲"
            size_text = "Small"
        elif volume >= 3000:
            size_emoji = "🌱"
            size_text = "Tiny"
        else:
            size_emoji = "🌿"
            size_text = "Micro"
        
        priority_text = ["Low", "Medium", "High"][block.priority - 1]
        risk_text = " (Old-growth)" if block.old_growth_affected else ""
        
        print(f"  - {block.id}: {size_emoji} {size_text} {format_volume(block.volume_m3)} - Priority: {priority_text}{risk_text}")
    
    state.cumulative_disturbance += planned_volume * 0.01


def conduct_harvest_operations(state: GameState):
    """Conduct harvest operations with disaster risks."""
    approved_blocks = [b for b in state.harvest_blocks if b.permit_status == PermitStatus.APPROVED]
    
    if not approved_blocks:
        print_subsection("HARVEST OPERATIONS")
        print("No approved blocks available for harvest this year.")
        return
    
    print_subsection("HARVEST OPERATIONS")
    print(f"Harvesting {len(approved_blocks)} blocks")
    
    # Natural disasters during harvest
    volume_loss_factor = natural_disasters_during_harvest(state, approved_blocks)
    
    # Calculate effective volume after disasters
    total_volume = 0
    for block in approved_blocks:
        effective_volume = block.volume_m3
        if block.disaster_affected:
            effective_volume = int(block.volume_m3 * (1 - block.volume_loss_percent))
        total_volume += effective_volume
    
    print(f"Total harvestable volume: {format_volume(total_volume)}")
    
    # Calculate revenue with certification bonuses
    base_revenue_per_m3 = state.revenue_per_m3
    cert_bonus = state.get_certification_revenue_bonus()
    effective_revenue_per_m3 = int(base_revenue_per_m3 * (1 + cert_bonus))
    
    revenue = total_volume * effective_revenue_per_m3
    costs = total_volume * state.operating_cost_per_m3
    
    # Disaster-related cost increases
    if volume_loss_factor > 0:
        costs = int(costs * (1 + volume_loss_factor * 0.5))  # 50% cost increase per % volume loss
    
    # Weather impacts (separate from natural disasters)
    weather_event = random.random()
    if weather_event < 0.1:
        print("🌨️  Severe winter weather delays operations")
        revenue *= 0.85
        costs *= 1.15
    elif weather_event < 0.25:
        print("🌧️  Poor weather conditions affect efficiency")
        revenue *= 0.95
        costs *= 1.05
    else:
        print("☀️  Good weather supports efficient operations")
    
    net_profit = revenue - costs
    state.budget += net_profit
    state.total_revenue += revenue
    state.total_costs += costs
    
    # Track quarterly profit for CEO profit sharing
    state.quarterly_profit = net_profit
    
    if net_profit > 0:
        state.consecutive_profitable_years += 1
    else:
        state.consecutive_profitable_years = 0
    
    print(f"Revenue: {format_currency(revenue)}")
    if cert_bonus > 0:
        print(f"  (includes {cert_bonus*100:.0f}% certification premium)")
    print(f"Costs: {format_currency(costs)}")
    print(f"Net profit: {format_currency(net_profit)}")
    
    # Jobs created
    jobs_this_year = total_volume // 1000
    state.jobs_created += jobs_this_year
    print(f"Jobs created: {jobs_this_year}")
    
    # Remove harvested blocks
    for block in approved_blocks:
        state.harvest_blocks.remove(block)


def annual_management_decisions(state: GameState):
    """Handle annual management decisions with multiple choice support."""
    print_subsection("QUARTERLY MANAGEMENT DECISIONS")
    print("💡 You can now pursue multiple activities (each additional activity costs 50% more)")
    
    management_activities = [
        {
            "name": "Focus on permit applications",
            "base_cost": 0,
            "action": lambda: selective_permit_submission(state),
            "description": "Submit strategic permit applications"
        },
        {
            "name": "First Nations liaison management", 
            "base_cost": 0,
            "action": lambda: liaison_management(state),
            "description": "Hire liaison or get consultation recommendations"
        },
        {
            "name": "CEO management and hiring",
            "base_cost": 0,
            "action": lambda: ceo_management(state),
            "description": "Hire CEO for automated decisions with profit sharing"
        },
        {
            "name": "Pursue forest certification",
            "base_cost": 0,
            "action": lambda: certification_opportunities(state),
            "description": "Apply for sustainability certifications"
        },
        {
            "name": "Conduct forest health monitoring",
            "base_cost": 30000,
            "action": lambda: _forest_health_action(state),
            "description": "Monitor biodiversity and forest condition"
        },
        {
            "name": "🔴 Explore criminal enterprises",
            "base_cost": 0,
            "action": lambda: enhanced_illegal_opportunities(state),
            "description": "Multi-stage criminal operations worth millions"
        },
        {
            "name": "Conduct voluntary safety audit",
            "base_cost": 0,
            "action": lambda: workplace_safety_audit(state),
            "description": "Proactive safety investment to reduce incident risk"
        }
    ]
    
    print("\nAvailable management activities:")
    for i, activity in enumerate(management_activities):
        cost_text = f" (${activity['base_cost']:,})" if activity['base_cost'] > 0 else ""
        print(f"{i+1}. {activity['name']}{cost_text}")
        print(f"   📝 {activity['description']}")
    
    # Allow multiple selections
    print("\nSelect activities (enter numbers separated by spaces, e.g., '1 3 4'):")
    print("⚠️  Each additional activity after the first costs 50% more")
    print("💡 Leave blank and press Enter to skip all activities this quarter")
    selection = input("> ").strip()
    
    if not selection:
        print("📋 No management activities selected this quarter.")
        print("💰 Budget preserved for future opportunities")
        return
    
    try:
        indices = [int(x) - 1 for x in selection.split()]
        selected_activities = [management_activities[i] for i in indices 
                             if 0 <= i < len(management_activities)]
    except (ValueError, IndexError):
        print("Invalid selection. Skipping management activities.")
        return
    
    if not selected_activities:
        print("No valid activities selected.")
        return
    
    # Calculate total costs with escalating pricing
    total_cost = 0
    for i, activity in enumerate(selected_activities):
        multiplier = 1.0 + (i * 0.5)  # 50% more for each additional activity
        activity_cost = int(activity['base_cost'] * multiplier)
        total_cost += activity_cost
    
    print(f"\nSelected {len(selected_activities)} activities:")
    running_cost = 0
    for i, activity in enumerate(selected_activities):
        multiplier = 1.0 + (i * 0.5)
        activity_cost = int(activity['base_cost'] * multiplier)
        running_cost += activity_cost
        
        cost_text = f" - {format_currency(activity_cost)}" if activity_cost > 0 else " - FREE"
        multiplier_text = f" (x{multiplier:.1f})" if i > 0 and activity['base_cost'] > 0 else ""
        print(f"{i+1}. {activity['name']}{cost_text}{multiplier_text}")
    
    print(f"Total estimated cost: {format_currency(total_cost)}")
    
    if total_cost > state.budget:
        print("⚠️  Insufficient budget for all selected activities!")
        return
    
    # Execute activities
    print("\nExecuting management activities:")
    for i, activity in enumerate(selected_activities):
        multiplier = 1.0 + (i * 0.5)
        activity_cost = int(activity['base_cost'] * multiplier)
        
        print(f"\n--- {activity['name']} ---")
        if activity_cost > 0:
            state.budget -= activity_cost
            print(f"💰 Cost: {format_currency(activity_cost)}")
        
        try:
            result = activity['action']()
            if activity['name'] == "🔴 Explore criminal enterprises" and result is False:
                print("🎖️  No criminal opportunities available this quarter.")
        except Exception as e:
            print(f"⚠️  Error executing {activity['name']}: {e}")


def _forest_health_action(state: GameState):
    """Execute forest health monitoring action."""
    forest_health_monitoring(state)
    state.biodiversity_score += 0.05
    print(f"✓ Forest health monitoring completed")
    print(f"📈 Biodiversity score increased: +0.05")


def check_win_conditions(state: GameState) -> Tuple[bool, str]:
    """Check win/loss conditions."""
    # Economic Sustainability Win
    if (state.consecutive_profitable_years >= 5 and 
        state.budget > 3000000 and 
        state.jobs_created > 200):
        return True, "ECONOMIC SUSTAINABILITY CHAMPION: You've built a profitable, job-creating forestry operation!"
    
    # Environmental Stewardship Win
    if (state.reputation > 0.8 and 
        state.biodiversity_score > 0.7 and 
        state.social_license_maintained and
        state.cumulative_disturbance < state.disturbance_cap * 0.6):
        return True, "ENVIRONMENTAL STEWARD: You've balanced forestry with ecosystem protection!"
    
    # Indigenous Reconciliation Win (requires more time and achievements)
    if (all(fn.relationship_level > 0.8 for fn in state.first_nations) and
        all(fn.agreement_signed for fn in state.first_nations) and
        state.reputation > 0.7 and
        state.years_operated >= 5 and
        state.total_revenue > 1000000):  # Must have actual operations
        return True, "RECONCILIATION LEADER: You've built strong partnerships with Indigenous communities!"
    
    # Certification Leader Win
    if (len(state.get_active_certifications()) >= 2 and
        state.reputation > 0.7 and
        state.consecutive_profitable_years >= 3):
        return True, "CERTIFICATION LEADER: You've achieved industry-leading sustainable practices!"
    
    # Survival Win
    if state.years_operated >= 10 and state.budget > 500000:
        return True, "INDUSTRY SURVIVOR: You've weathered the storms of a changing industry!"
    
    # Loss conditions
    if state.budget < 0:
        return True, "BANKRUPTCY: Your company has run out of money. Game over."
    
    if state.reputation < 0.1:
        return True, "REPUTATION COLLAPSE: Your social license to operate has been revoked. Game over."
    
    if state.cumulative_disturbance > state.disturbance_cap * 1.2:
        return True, "REGULATORY SHUTDOWN: Exceeded disturbance caps. Operations suspended by government."
    
    return False, ""


def quarter_end_summary(state: GameState):
    """Display comprehensive quarter-end summary."""
    quarter_names = ["", "Q1 (Spring)", "Q2 (Summer)", "Q3 (Fall)", "Q4 (Winter)"]
    print_subsection(f"END OF {quarter_names[state.quarter]} {state.year} SUMMARY")
    
    print(f"Budget: {format_currency(state.budget)}")
    print(f"Reputation: {state.reputation:.2f}/1.0")
    print(f"Annual Allowable Cut: {format_volume(state.annual_allowable_cut)}")
    
    # Disturbance tracking
    disturbance_ratio = state.cumulative_disturbance / state.disturbance_cap
    print(f"Cumulative Disturbance: {state.cumulative_disturbance:,.0f}/{state.disturbance_cap:,.0f} ha ({disturbance_ratio:.1%})")
    
    # Economic metrics
    print(f"Jobs Created (total): {state.jobs_created}")
    print(f"Consecutive Profitable Years: {state.consecutive_profitable_years}")
    
    # Permits status
    pending_permits = len([b for b in state.harvest_blocks if b.permit_status == PermitStatus.PENDING])
    approved_blocks = len([b for b in state.harvest_blocks if b.permit_status == PermitStatus.APPROVED])
    print(f"Harvest Blocks: {approved_blocks} approved, {pending_permits} pending permits")
    
    # Certifications
    active_certs = state.get_active_certifications()
    if active_certs:
        cert_names = [c.cert_type.value for c in active_certs]
        print(f"Active Certifications: {', '.join(cert_names)}")
    
    # First Nations relationships
    if state.first_nations:
        avg_relationship = sum(fn.relationship_level for fn in state.first_nations) / len(state.first_nations)
        print(f"Average First Nations Relationship: {avg_relationship:.2f}/1.0")
    
    # Apply AAC decline only at end of year (Q4)
    if state.quarter == 4:
        old_aac = state.annual_allowable_cut
        state.annual_allowable_cut = int(state.annual_allowable_cut * (1 - state.aac_decline_rate))
        print(f"📉 Annual AAC declining: {format_volume(old_aac)} → {format_volume(state.annual_allowable_cut)} (-{state.aac_decline_rate*100:.1f}%)")
    else:
        print("📊 AAC unchanged this quarter")


def advance_quarter(state: GameState):
    """Advance to the next quarter."""
    state.quarter += 1
    if state.quarter > 4:
        state.quarter = 1
        state.year += 1
        state.years_operated += 1


def play_game():
    """Main game loop - now runs quarterly!"""
    print("=== BC INTERIOR FORESTRY SIMULATOR - ENHANCED ===")
    print("Navigate complex forestry operations with:")
    print("• Quarterly decision cycles for faster action")
    print("• Selective permit submission strategies")
    print("• Natural disasters and forest health challenges") 
    print("• Ongoing First Nations consultation requirements")
    print("• Forest certification for premium markets")
    print("• 👔 Advanced CEO system: automated decisions with costs, performance tracking, and swapping")
    print("• 📞 First Nations liaison system with consultation recommendations")
    print("• 🚨 Random First Nations anger events requiring crisis management")
    print("• 💀 Workplace safety incidents with WorkSafeBC investigations")
    if ENABLE_WACKY_EVENTS:
        print("• 🎪 Bizarre wacky events every quarter [ENABLED]")
    else:
        print("• 🎪 Wacky events [DISABLED - edit ENABLE_WACKY_EVENTS flag to enable]")
    print("• 🔴 Multi-stage criminal enterprises: tax fraud, drugs, corruption worth $10M+")
    print("• Multiple management activities per quarter")
    print("• Variable harvest block sizes")
    print("• Multiple pathways to success\n")
    
    company_name = input("Name your forestry company: ").strip() or "Northern Forest Solutions"
    state = GameState()
    
    # Initial setup
    choose_region(state)
    initial_setup(state)
    
    print(f"\n{company_name} is now operational in the {state.region} region!")
    print(f"Starting budget: {format_currency(state.budget)}")
    print("🗓️  Game runs quarterly - make decisions every 3 months!")
    
    # Main game loop - quarterly cycles
    total_quarters = 60  # 15 years * 4 quarters
    quarter_count = 0
    
    while quarter_count < total_quarters:
        quarter_count += 1
        quarter_names = ["", "Q1 (Spring)", "Q2 (Summer)", "Q3 (Fall)", "Q4 (Winter)"]
        season_emojis = ["", "🌱", "☀️", "🍂", "❄️"]
        
        print_section_header(
            f"{company_name} - {season_emojis[state.quarter]} {quarter_names[state.quarter]}", 
            state.year
        )
        
        # Seasonal events (some events only happen in certain quarters)
        if state.quarter == 1:  # Spring - planning season
            print("🌱 SPRING: Planning and permit season begins!")
            random_policy_events(state)
            ongoing_first_nations_consultation(state)
            plan_harvest_schedule(state)
            
        elif state.quarter == 2:  # Summer - active harvesting
            print("☀️ SUMMER: Prime harvesting season!")
            process_permits(state)
            conduct_harvest_operations(state)
            
        elif state.quarter == 3:  # Fall - more harvesting and planning
            print("🍂 FALL: Harvest continues, winter prep begins!")
            process_permits(state)
            conduct_harvest_operations(state)
            
        else:  # Winter - planning and administration
            print("❄️ WINTER: Planning season, limited field operations!")
            maintain_certifications(state)
            market_fluctuations(state)
            
            # Pay annual costs (Q4 each year)
            if hasattr(state, 'fn_liaison') and state.fn_liaison is not None:
                liaison_cost = state.fn_liaison.cost
                if state.budget >= liaison_cost:
                    state.budget -= liaison_cost
                    print(f"💰 Annual liaison fee: {format_currency(liaison_cost)} paid to {state.fn_liaison.name}")
                else:
                    print(f"❌ Cannot afford liaison fee! {state.fn_liaison.name} contract terminated")
                    state.fn_liaison = None
            
            # Pay CEO annual fees and profit sharing
            pay_ceo_annual_costs(state)
        
        # Quarterly wacky events (40% chance each quarter) - optional
        if ENABLE_WACKY_EVENTS:
            quarterly_wacky_events(state)
        
        # Workplace safety incidents (including fatalities)
        workplace_safety_incidents(state)
        
        # Random First Nations anger events (adds more interactivity)
        if check_anger_event_triggers(state) or random.random() < 0.25:  # 25% base chance + triggers
            random_first_nations_anger_events(state)
        
        # CEO automated decisions (if CEO is hired) - now with costs
        ceo_decisions = ceo_automated_decisions(state)
        if ceo_decisions:
            print_subsection("CEO AUTOMATED ACTIONS")
            for decision in ceo_decisions:
                print(f"👔 {decision}")
        
        # Ongoing consequences from criminal activities and safety incidents
        ongoing_criminal_consequences(state)
        ongoing_safety_consequences(state)
        
        # Management decisions (available every quarter)
        annual_management_decisions(state)
        
        # CEO quarterly report (if CEO exists)
        ceo_quarterly_report(state)
        
        # Quarter-end summary
        quarter_end_summary(state)
        
        # Check win/loss conditions
        game_over, message = check_win_conditions(state)
        if game_over:
            print(f"\n🎯 {message}")
            break
        
        # Continue prompt (every 4 quarters ask if they want to continue)
        if state.quarter == 4 and quarter_count < total_quarters - 4:
            choice = ask(f"Continue to {state.year + 1}?", ["Yes", "No", "Play 1 more quarter only"])
            if choice == 1:
                print("You've decided to end operations. Thanks for playing!")
                break
            elif choice == 2:
                total_quarters = quarter_count + 1  # Play one more quarter
        
        # Advance to next quarter
        advance_quarter(state)
    
    # Final results
    print_section_header("FINAL RESULTS")
    print(f"Company: {company_name}")
    print(f"Years Operated: {state.years_operated}")
    print(f"Final Budget: {format_currency(state.budget)}")
    print(f"Total Revenue: {format_currency(state.total_revenue)}")
    print(f"Total Jobs Created: {state.jobs_created}")
    print(f"Final Reputation: {state.reputation:.2f}/1.0")
    print(f"Environmental Impact: {state.cumulative_disturbance:,.0f} ha disturbed")
    
    # Certifications achieved
    all_certs = [c for c in state.certifications if c.obtained_year > 0]
    if all_certs:
        print(f"Certifications Achieved: {', '.join(c.cert_type.value for c in all_certs)}")
    
    if state.budget > 0:
        roi = ((state.budget - 2500000) / 2500000) * 100
        print(f"Return on Investment: {roi:.1f}%")
    
    print("\nThanks for playing the Enhanced BC Interior Forestry Simulator!")


if __name__ == "__main__":
    play_game()