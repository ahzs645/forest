"""
First Nations Consultation System
Handles ongoing relationships and negotiations throughout gameplay
"""

import random
from typing import List
from game_models import GameState, FirstNation
from utils import ask, print_subsection, format_currency, calculate_relationship_text


def ongoing_first_nations_consultation(state: GameState):
    """Handle ongoing First Nations consultation during regular gameplay."""
    nations_needing_consultation = [fn for fn in state.first_nations 
                                  if fn.needs_consultation(state.year)]
    
    if not nations_needing_consultation:
        return
    
    print_subsection("FIRST NATIONS CONSULTATION REQUIRED")
    print("The following First Nations require renewed consultation:")
    
    for fn in nations_needing_consultation:
        relationship_text = calculate_relationship_text(fn.relationship_level)
        treaty_text = " (Treaty Rights Area)" if fn.treaty_area else ""
        
        # Fix the consultation date calculation
        if fn.last_consultation_year == 0:
            years_since_text = "Never consulted"
        else:
            years_since = state.year - fn.last_consultation_year
            years_since_text = f"{years_since} year{'s' if years_since != 1 else ''} ago"
        
        print(f"  - {fn.name}: {relationship_text} relationship{treaty_text}")
        print(f"    Last consultation: {years_since_text}")
        print(f"    Base consultation cost: {format_currency(fn.consultation_cost)}")
        if fn.treaty_area:
            print(f"    ⚠️  Treaty Nation: Higher consultation standards required")
    
    # Options for consultation approach
    options = [
        "Conduct comprehensive consultations with all Nations",
        "Schedule individual meetings with each Nation",
        "Send formal notification letters only (minimal compliance)",
        "Delay consultations (risk deteriorating relationships)"
    ]
    
    choice = ask("How will you approach required consultations?", options)
    
    if choice == 0:  # Comprehensive consultations
        total_cost = sum(fn.consultation_cost * 2 for fn in nations_needing_consultation)
        
        if state.budget < total_cost:
            print(f"Insufficient budget for comprehensive consultations: {format_currency(total_cost)}")
            return
        
        print(f"Conducting comprehensive consultations for {format_currency(total_cost)}")
        state.budget -= total_cost
        
        for fn in nations_needing_consultation:
            fn.last_consultation_year = state.year
            fn.relationship_level += 0.2
            fn.active_negotiations = True
            
            # Treaty 8 Nations have special requirements
            if fn.treaty_area:
                if state.cumulative_disturbance > state.disturbance_cap * 0.7:
                    print(f"⚠️  {fn.name} raises serious concerns about cumulative impacts")
                    fn.relationship_level -= 0.1
                    _trigger_treaty_negotiations(state, fn)
                else:
                    print(f"✓ {fn.name} appreciates thorough ecosystem-based approach")
                    fn.agreement_signed = True
            else:
                fn.agreement_signed = True
                print(f"✓ {fn.name} signs cooperation agreement")
        
        state.reputation += 0.2
        state.permit_bonus += 0.15
        
    elif choice == 1:  # Individual meetings
        total_cost = sum(fn.consultation_cost for fn in nations_needing_consultation)
        
        if state.budget < total_cost:
            print(f"Insufficient budget for individual consultations: {format_currency(total_cost)}")
            return
        
        print(f"Scheduling individual consultations for {format_currency(total_cost)}")
        state.budget -= total_cost
        
        for fn in nations_needing_consultation:
            fn.last_consultation_year = state.year
            fn.relationship_level += 0.1
            
            # Individual outcomes vary
            if random.random() < 0.7:  # 70% success rate
                print(f"✓ Productive meeting with {fn.name}")
                if not fn.treaty_area or state.cumulative_disturbance < state.disturbance_cap * 0.8:
                    fn.agreement_signed = True
            else:
                print(f"⚠️  {fn.name} requests additional consultation")
                fn.consultation_cost += 5000
        
        state.reputation += 0.1
        state.permit_bonus += 0.05
        
    elif choice == 2:  # Minimal compliance
        notification_cost = len(nations_needing_consultation) * 2000
        state.budget -= notification_cost
        
        print(f"Sending formal notifications for {format_currency(notification_cost)}")
        
        for fn in nations_needing_consultation:
            fn.last_consultation_year = state.year
            fn.relationship_level -= 0.2
            
            if fn.treaty_area:
                print(f"⚠️  {fn.name} formally objects to minimal consultation")
                fn.agreement_signed = False
                # May trigger legal challenges
                if random.random() < 0.3:
                    _trigger_legal_challenge(state, fn)
            else:
                print(f"⚠️  {fn.name} expresses disappointment with approach")
        
        state.reputation -= 0.2
        state.permit_bonus -= 0.1
        
    else:  # Delay consultations
        print("Delaying required consultations...")
        
        for fn in nations_needing_consultation:
            fn.relationship_level -= 0.3
            fn.agreement_signed = False
            
            if fn.treaty_area:
                print(f"🚨 {fn.name} files formal complaint about consultation delays")
                # Guaranteed legal challenge for Treaty Nations
                _trigger_legal_challenge(state, fn)
            else:
                print(f"⚠️  {fn.name} withdraws support for operations")
        
        state.reputation -= 0.3
        state.permit_bonus -= 0.2
        state.social_license_maintained = False


def _trigger_treaty_negotiations(state: GameState, fn: FirstNation):
    """Handle special Treaty 8 style negotiations."""
    print(f"\n🏛️  TREATY NEGOTIATIONS: {fn.name} invokes treaty rights")
    print("   Ecosystem-based management plan required")
    
    options = [
        f"Agree to ecosystem-based management plan ({format_currency(100000)})",
        f"Propose compromise disturbance reduction ({format_currency(50000)})",
        "Reject treaty demands (high risk)"
    ]
    
    choice = ask("Response to treaty negotiations:", options)
    
    if choice == 0:  # Full ecosystem plan
        if state.budget >= 100000:
            state.budget -= 100000
            state.disturbance_cap = int(state.disturbance_cap * 0.8)  # Reduce cap by 20%
            fn.relationship_level = 0.8
            fn.agreement_signed = True
            state.reputation += 0.3
            print(f"✓ Ecosystem-based management plan implemented")
            print(f"  New disturbance cap: {state.disturbance_cap:,} hectares")
        else:
            print("Insufficient budget for ecosystem plan!")
            fn.relationship_level -= 0.2
            
    elif choice == 1:  # Compromise
        if state.budget >= 50000:
            state.budget -= 50000
            state.disturbance_cap = int(state.disturbance_cap * 0.9)  # Reduce cap by 10%
            fn.relationship_level += 0.1
            
            if random.random() < 0.6:  # 60% chance of acceptance
                fn.agreement_signed = True
                print(f"✓ Compromise accepted by {fn.name}")
            else:
                print(f"⚠️  {fn.name} rejects compromise - legal action likely")
                _trigger_legal_challenge(state, fn)
        else:
            print("Insufficient budget for compromise!")
            fn.relationship_level -= 0.2
            
    else:  # Reject demands
        print(f"❌ Treaty demands rejected")
        fn.relationship_level = 0.1
        fn.agreement_signed = False
        state.reputation -= 0.4
        _trigger_legal_challenge(state, fn)


def _trigger_legal_challenge(state: GameState, fn: FirstNation):
    """Handle legal challenges from First Nations."""
    print(f"\n⚖️  LEGAL CHALLENGE: {fn.name} initiates court action")
    
    # Legal costs
    legal_cost = random.randint(75000, 200000)
    state.budget -= legal_cost
    
    # Court outcome based on relationship and compliance
    win_chance = 0.3 + (fn.relationship_level * 0.3) + (state.reputation * 0.2)
    
    if random.random() < win_chance:
        print(f"✓ Court rules in favor of company (Legal costs: {format_currency(legal_cost)})")
        fn.relationship_level += 0.1
    else:
        print(f"❌ Court rules against company")
        print(f"   Legal costs: {format_currency(legal_cost)}")
        print(f"   Operations suspended pending compliance")
        
        # Suspend operations for a year
        for block in state.harvest_blocks:
            if block.permit_status.value == "approved":
                block.permit_status = "delayed"
        
        state.reputation -= 0.3
        fn.relationship_level -= 0.2


def build_relationships_action(state: GameState):
    """Proactive relationship building with First Nations."""
    if not state.first_nations:
        return
    
    print_subsection("RELATIONSHIP BUILDING OPPORTUNITIES")
    
    # Show relationship status
    for fn in state.first_nations:
        relationship_text = calculate_relationship_text(fn.relationship_level)
        print(f"  {fn.name}: {relationship_text} ({fn.relationship_level:.2f})")
    
    options = [
        "Fund community development projects ($75,000)",
        "Establish youth training programs ($40,000)",
        "Create joint monitoring committee ($25,000)",
        "Sponsor cultural events ($15,000)",
        "No relationship building this year"
    ]
    
    choice = ask("Choose relationship building approach:", options)
    
    costs = [75000, 40000, 25000, 15000, 0]
    bonuses = [0.3, 0.2, 0.15, 0.1, 0]
    
    if choice < 4:
        cost = costs[choice]
        bonus = bonuses[choice]
        
        if state.budget >= cost:
            state.budget -= cost
            
            for fn in state.first_nations:
                fn.relationship_level = min(1.0, fn.relationship_level + bonus)
            
            state.reputation += bonus
            print(f"✓ Relationship building successful - cost: {format_currency(cost)}")
            print(f"  All First Nations relationships improved by {bonus:.2f}")
        else:
            print(f"Insufficient budget: {format_currency(cost)} required")
    else:
        print("No relationship building activities this year")