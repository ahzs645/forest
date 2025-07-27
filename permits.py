"""
Permit Management System
Handles permit applications, processing, and selective submission
"""

import random
from typing import List
from game_models import GameState, HarvestBlock, PermitStatus
from utils import ask, print_subsection, format_currency, format_volume


def selective_permit_submission(state: GameState):
    """Allow players to selectively submit permits based on priority and risk."""
    print_subsection("SELECTIVE PERMIT SUBMISSION")
    
    blocks_to_submit = [b for b in state.harvest_blocks if b.permit_status == PermitStatus.PENDING]
    
    if not blocks_to_submit:
        print("No blocks requiring permits.")
        return
    
    print(f"Current government backlog: {state.permit_backlog_days} days average")
    print(f"Available blocks for permit application:")
    
    # Display blocks with risk assessment
    for i, block in enumerate(blocks_to_submit):
        risk_factors = []
        risk_score = 0
        
        if block.old_growth_affected:
            risk_factors.append("old-growth concerns")
            risk_score += 3
        if not block.heritage_cleared:
            risk_factors.append("heritage assessment needed")
            risk_score += 2
        if not block.first_nations_agreement:
            risk_factors.append("First Nations consultation required")
            risk_score += 4
        if block.disaster_affected:
            risk_factors.append(f"{block.disaster_type.value} damage")
            risk_score += 1
            
        risk_level = "LOW" if risk_score <= 2 else "MEDIUM" if risk_score <= 5 else "HIGH"
        risk_color = "🟢" if risk_score <= 2 else "🟡" if risk_score <= 5 else "🔴"
        
        risk_text = f" (Risk factors: {', '.join(risk_factors)})" if risk_factors else ""
        priority_text = ["Low", "Medium", "High"][block.priority - 1]
        
        print(f"  {i+1}. {block.id}: {format_volume(block.volume_m3)} - "
              f"Priority: {priority_text} - Risk: {risk_color} {risk_level}{risk_text}")
    
    # Submission options
    options = [
        "Submit all blocks (highest cost, fastest processing)",
        "Submit high priority blocks only",
        "Submit low-risk blocks only", 
        "Custom selection",
        "Skip permit submissions this year"
    ]
    
    choice = ask("Choose permit submission strategy:", options)
    
    blocks_to_process = []
    
    if choice == 0:  # Submit all
        blocks_to_process = blocks_to_submit
        
    elif choice == 1:  # High priority only
        blocks_to_process = [b for b in blocks_to_submit if b.priority >= 3]
        if not blocks_to_process:
            print("No high priority blocks available.")
            return
            
    elif choice == 2:  # Low risk only
        blocks_to_process = []
        for block in blocks_to_submit:
            risk_score = 0
            if block.old_growth_affected: risk_score += 3
            if not block.heritage_cleared: risk_score += 2
            if not block.first_nations_agreement: risk_score += 4
            if block.disaster_affected: risk_score += 1
            
            if risk_score <= 2:
                blocks_to_process.append(block)
                
        if not blocks_to_process:
            print("No low-risk blocks available.")
            return
            
    elif choice == 3:  # Custom selection
        print("\nSelect blocks to submit (enter numbers separated by spaces, e.g., '1 3 5'):")
        selection = input("> ").strip()
        
        try:
            indices = [int(x) - 1 for x in selection.split()]
            blocks_to_process = [blocks_to_submit[i] for i in indices 
                               if 0 <= i < len(blocks_to_submit)]
        except (ValueError, IndexError):
            print("Invalid selection. Skipping permits this year.")
            return
            
    else:  # Skip
        print("Skipping permit submissions this year.")
        return
    
    if not blocks_to_process:
        print("No blocks selected for submission.")
        return
    
    # Calculate costs
    base_cost_per_application = 5000
    total_cost = len(blocks_to_process) * base_cost_per_application
    
    # Additional costs for complex applications
    complex_blocks = sum(1 for b in blocks_to_process if not b.first_nations_agreement or b.old_growth_affected)
    additional_cost = complex_blocks * 10000
    total_cost += additional_cost
    
    print(f"\nSubmission Summary:")
    print(f"Blocks selected: {len(blocks_to_process)}")
    print(f"Total volume: {format_volume(sum(b.volume_m3 for b in blocks_to_process))}")
    print(f"Base application cost: {format_currency(len(blocks_to_process) * base_cost_per_application)}")
    if additional_cost > 0:
        print(f"Complex application fees: {format_currency(additional_cost)}")
    print(f"Total cost: {format_currency(total_cost)}")
    
    if state.budget < total_cost:
        print(f"Insufficient budget! Need {format_currency(total_cost)}, have {format_currency(state.budget)}")
        return
    
    confirm = ask(f"Proceed with submission?", ["Yes", "No"])
    if confirm == 0:
        state.budget -= total_cost
        
        for block in blocks_to_process:
            block.permit_submitted = state.year
            # Calculate processing time based on risk factors and backlog
            base_time = state.permit_backlog_days
            
            if block.old_growth_affected:
                base_time += 60
            if not block.heritage_cleared:
                base_time += 30
            if not block.first_nations_agreement:
                base_time += 90
            if block.disaster_affected:
                base_time += 20  # Additional review for damaged timber
                
            # Priority affects processing (high priority gets expedited)
            if block.priority >= 3:
                base_time = int(base_time * 0.8)  # 20% faster
            elif block.priority == 1:
                base_time = int(base_time * 1.2)  # 20% slower
            
            block.processing_time = base_time + random.randint(-30, 60)
            print(f"Submitted {block.id} - estimated processing: {block.processing_time} days")
        
        print(f"Budget remaining: {format_currency(state.budget)}")


def process_permits(state: GameState):
    """Process pending permit applications."""
    pending_blocks = [b for b in state.harvest_blocks 
                     if b.permit_status == PermitStatus.PENDING and b.permit_submitted > 0]
    
    if not pending_blocks:
        return
    
    print_subsection("PERMIT DECISIONS")
    
    decisions_made = False
    
    for block in pending_blocks:
        # Calculate days elapsed including quarters
        years_elapsed = state.year - block.permit_submitted
        quarters_elapsed = (years_elapsed * 4) + (state.quarter - 1)
        days_elapsed = quarters_elapsed * 90  # Roughly 90 days per quarter
        
        if days_elapsed >= block.processing_time:
            decisions_made = True
            
            # Determine approval
            approval_chance = 0.7 + state.permit_bonus + (state.reputation - 0.5) * 0.3
            
            # Penalties for various issues
            if block.old_growth_affected and state.old_growth_deferrals_expanded:
                approval_chance -= 0.4
            if not block.first_nations_agreement:
                approval_chance -= 0.3
            if state.cumulative_disturbance > state.disturbance_cap:
                approval_chance -= 0.5
            if block.disaster_affected:
                approval_chance += 0.1  # Salvage permits easier to get
            
            # Certification helps with approvals
            cert_bonus = min(0.2, len(state.get_active_certifications()) * 0.1)
            approval_chance += cert_bonus
            
            if random.random() < approval_chance:
                block.permit_status = PermitStatus.APPROVED
                print(f"🟢 ✅ PERMIT APPROVED: {block.id}")
                print(f"   📊 Volume: {format_volume(block.volume_m3)}")
                print(f"   ⚡ Ready for harvest operations")
            else:
                block.permit_status = PermitStatus.DENIED
                denial_reason = _get_denial_reason(block, state)
                print(f"🔴 ❌ PERMIT DENIED: {block.id}")
                print(f"   📊 Volume: {format_volume(block.volume_m3)}")
                print(f"   📋 Reason: {denial_reason}")
                print(f"   📉 Reputation impact: -0.05")
                state.reputation -= 0.05
    
    if not decisions_made:
        print("No permit decisions ready this year.")
        
        # Show processing status
        for block in pending_blocks:
            years_elapsed = state.year - block.permit_submitted
            quarters_elapsed = (years_elapsed * 4) + (state.quarter - 1)
            days_elapsed = quarters_elapsed * 90
            progress = min(100, (days_elapsed / block.processing_time) * 100)
            print(f"  {block.id}: {progress:.0f}% processed ({days_elapsed}/{block.processing_time} days)")


def _get_denial_reason(block: HarvestBlock, state: GameState) -> str:
    """Generate a realistic denial reason."""
    reasons = []
    
    if block.old_growth_affected and state.old_growth_deferrals_expanded:
        reasons.append("old-growth deferral conflict")
    if not block.first_nations_agreement:
        reasons.append("inadequate First Nations consultation")
    if state.cumulative_disturbance > state.disturbance_cap:
        reasons.append("exceeds cumulative disturbance limits")
    if not block.heritage_cleared:
        reasons.append("incomplete heritage assessment")
    
    if reasons:
        return reasons[0]
    else:
        return "insufficient environmental mitigation measures"