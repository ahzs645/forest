"""
Events System
Handles random events, policy changes, and natural disasters
"""

import random
from typing import List
from game_models import GameState, HarvestBlock, DisasterType, PermitStatus
from utils import print_subsection, ask, format_currency, format_volume


def random_policy_events(state: GameState):
    """Handle random policy and regulatory events."""
    print_subsection("POLICY & REGULATORY UPDATES")
    
    event_chance = random.random()
    
    if event_chance < 0.15 and not state.old_growth_deferrals_expanded:
        print("🏛️  GOVERNMENT ANNOUNCEMENT: Additional old-growth deferrals implemented")
        print("   2M hectares of old-growth forests now under deferral")
        state.old_growth_deferrals_expanded = True
        
        # Cancel blocks in old-growth areas
        blocks_to_remove = []
        for block in state.harvest_blocks:
            if block.old_growth_affected and block.permit_status != PermitStatus.APPROVED:
                print(f"   Block {block.id} cancelled due to old-growth deferral")
                blocks_to_remove.append(block)
        
        for block in blocks_to_remove:
            state.harvest_blocks.remove(block)
        state.reputation += 0.1
        
    elif event_chance < 0.2 and not state.glyphosate_banned:
        print("🌿 POLICY CHANGE: Provincial government phases out glyphosate use")
        print("   Chemical vegetation control no longer permitted")
        state.glyphosate_banned = True
        state.reputation += 0.15
        
    elif event_chance < 0.3:
        print("⚡ WILDFIRE SEASON: Major fires affect timber supply")
        print("   Government fast-tracks salvage permits (25-day timeline)")
        state.permit_backlog_days = max(25, state.permit_backlog_days - 30)
        
        # Reduce AAC due to fire damage
        old_aac = state.annual_allowable_cut
        state.annual_allowable_cut = int(state.annual_allowable_cut * 0.95)
        print(f"   AAC reduced: {old_aac:,} → {state.annual_allowable_cut:,} m³")
        
    elif event_chance < 0.4:
        print("📰 MEDIA SPOTLIGHT: Forestry practices under public scrutiny")
        if state.reputation < 0.5:
            print("   Negative coverage damages company reputation")
            state.reputation -= 0.2
            state.social_license_maintained = False
        else:
            print("   Positive coverage highlights sustainable practices")
            state.reputation += 0.1
            
    elif event_chance < 0.5:
        print("⚖️  COURT RULING: First Nations win land rights case")
        print("   Stricter consultation requirements now in effect")
        for fn in state.first_nations:
            if fn.treaty_area and not fn.agreement_signed:
                fn.consultation_cost += 15000
                print(f"   {fn.name} requires enhanced consultation process")
    else:
        print("📋 No major policy changes this year")


def natural_disasters_during_harvest(state: GameState, approved_blocks: List[HarvestBlock]) -> float:
    """
    Handle natural disasters that affect harvest operations.
    Returns volume loss factor (0.0 = no loss, 1.0 = total loss)
    """
    if not approved_blocks:
        return 0.0
    
    print_subsection("NATURAL EVENTS DURING HARVEST")
    
    # Check for various disasters
    disaster_chance = random.random()
    total_volume_loss = 0.0
    
    if disaster_chance < 0.08:  # 8% chance of beetle kill
        print("🐛 MOUNTAIN PINE BEETLE OUTBREAK detected in harvest areas")
        affected_blocks = random.sample(approved_blocks, min(2, len(approved_blocks)))
        
        for block in affected_blocks:
            loss_percent = random.uniform(0.2, 0.6)  # 20-60% volume loss
            block.disaster_affected = True
            block.disaster_type = DisasterType.BEETLE_KILL
            block.volume_loss_percent = loss_percent
            total_volume_loss += block.volume_m3 * loss_percent
            
            print(f"   Block {block.id}: {loss_percent*100:.1f}% volume loss to beetle kill")
        
        print("   ⚠️  Salvage operations required - reduced timber quality")
        
    elif disaster_chance < 0.12:  # 4% chance of windstorm
        print("🌪️  SEVERE WINDSTORM damages standing timber")
        affected_blocks = random.sample(approved_blocks, min(1, len(approved_blocks)))
        
        for block in affected_blocks:
            loss_percent = random.uniform(0.1, 0.3)  # 10-30% volume loss
            block.disaster_affected = True
            block.disaster_type = DisasterType.WINDSTORM
            block.volume_loss_percent = loss_percent
            total_volume_loss += block.volume_m3 * loss_percent
            
            print(f"   Block {block.id}: {loss_percent*100:.1f}% volume loss to windthrow")
        
    elif disaster_chance < 0.15:  # 3% chance of drought affecting operations
        print("🌵 SEVERE DROUGHT restricts harvesting operations")
        print("   Fire restrictions limit operational windows")
        
        # Affects all blocks but with lower loss
        for block in approved_blocks:
            loss_percent = random.uniform(0.05, 0.15)  # 5-15% volume loss
            block.disaster_affected = True
            block.disaster_type = DisasterType.DROUGHT
            block.volume_loss_percent = loss_percent
            total_volume_loss += block.volume_m3 * loss_percent
            
        print(f"   Operations restricted across all blocks")
        
    elif disaster_chance < 0.17:  # 2% chance of flooding
        print("🌊 SPRING FLOODING delays road access")
        affected_blocks = random.sample(approved_blocks, min(1, len(approved_blocks)))
        
        for block in affected_blocks:
            loss_percent = random.uniform(0.15, 0.25)  # 15-25% volume loss due to delays
            block.disaster_affected = True
            block.disaster_type = DisasterType.FLOOD
            block.volume_loss_percent = loss_percent
            total_volume_loss += block.volume_m3 * loss_percent
            
            print(f"   Block {block.id}: {loss_percent*100:.1f}% volume loss due to access delays")
    
    else:
        print("☀️  No major natural disasters this harvest season")
        return 0.0
    
    # Calculate total percentage loss across all approved volume
    total_approved_volume = sum(block.volume_m3 for block in approved_blocks)
    if total_approved_volume > 0:
        avg_loss_factor = total_volume_loss / total_approved_volume
        print(f"   Total estimated volume loss: {total_volume_loss:,.0f} m³ ({avg_loss_factor*100:.1f}%)")
        
        # Offer sanitation harvesting for beetle outbreaks
        if any(block.disaster_type == DisasterType.BEETLE_KILL for block in approved_blocks):
            _offer_sanitation_harvesting(state, approved_blocks, total_volume_loss)
        
        return avg_loss_factor
    
    return 0.0


def forest_health_monitoring(state: GameState):
    """Monitor overall forest health and apply long-term effects."""
    print_subsection("FOREST HEALTH ASSESSMENT")
    
    # Check cumulative beetle kill impact
    beetle_affected_blocks = [b for b in state.harvest_blocks 
                            if b.disaster_affected and b.disaster_type == DisasterType.BEETLE_KILL]
    
    if len(beetle_affected_blocks) >= 3:
        print("⚠️  FOREST HEALTH ALERT: Widespread beetle kill detected")
        print("   Future AAC reductions likely as damaged stands are prioritized")
        state.aac_decline_rate += 0.01  # Accelerate AAC decline
        
    # Biodiversity impacts from disasters
    disaster_affected = len([b for b in state.harvest_blocks if b.disaster_affected])
    if disaster_affected > 0:
        biodiversity_impact = disaster_affected * 0.02
        state.biodiversity_score = max(0, state.biodiversity_score - biodiversity_impact)
        print(f"   Biodiversity score adjusted: -{biodiversity_impact:.2f}")
    
    print(f"   Current forest health: {'Good' if state.biodiversity_score > 0.6 else 'Fair' if state.biodiversity_score > 0.3 else 'Poor'}")


def market_fluctuations(state: GameState):
    """Handle market price fluctuations."""
    price_change = random.uniform(-0.15, 0.15)  # ±15% price variation
    
    if abs(price_change) > 0.05:  # Only report significant changes
        old_price = state.revenue_per_m3
        state.revenue_per_m3 = int(state.revenue_per_m3 * (1 + price_change))
        
        direction = "increased" if price_change > 0 else "decreased"
        print(f"📈 MARKET UPDATE: Lumber prices {direction}")
        print(f"   Price: ${old_price}/m³ → ${state.revenue_per_m3}/m³ ({price_change*100:+.1f}%)")


def _offer_sanitation_harvesting(state: GameState, affected_blocks: List[HarvestBlock], volume_loss: float):
    """Offer sanitation harvesting permits for beetle-killed timber."""
    print_subsection("🚨 SANITATION HARVESTING OPPORTUNITY")
    print("🐛 Mountain Pine Beetle outbreak qualifies for emergency sanitation permits!")
    print("   ⚡ Fast-track permitting (30 days vs. standard 120+ days)")
    print("   💰 Reduced stumpage fees (50% discount)")
    print("   ⏰ Limited time offer - beetle wood degrades quickly")
    
    beetle_blocks = [b for b in affected_blocks if b.disaster_type == DisasterType.BEETLE_KILL]
    total_beetle_volume = sum(b.volume_m3 for b in beetle_blocks)
    recoverable_volume = int(total_beetle_volume * 0.7)  # 70% recoverable through sanitation
    
    print(f"\nSanitation harvest potential:")
    print(f"   🌲 Affected blocks: {len(beetle_blocks)}")
    print(f"   📊 Beetle-killed volume: {format_volume(total_beetle_volume)}")
    print(f"   ♻️  Recoverable volume: {format_volume(recoverable_volume)} (70%)")
    
    reduced_stumpage_cost = recoverable_volume * 15  # $15/m³ vs. normal $30/m³
    normal_revenue = recoverable_volume * state.revenue_per_m3 * 0.6  # 60% price for beetle wood
    
    print(f"   💵 Reduced stumpage cost: {format_currency(reduced_stumpage_cost)}")
    print(f"   💰 Expected revenue: {format_currency(normal_revenue)} (60% of normal price)")
    
    options = [
        f"Apply for emergency sanitation permits ({format_currency(reduced_stumpage_cost)})",
        "Let beetle wood deteriorate (no action)",
        "Wait for normal permit process (risk wood degradation)"
    ]
    
    choice = ask("Sanitation harvesting decision:", options)
    
    if choice == 0:  # Apply for sanitation permits
        if state.budget >= reduced_stumpage_cost:
            state.budget -= reduced_stumpage_cost
            
            print("✅ Emergency sanitation permits approved!")
            print("   ⚡ 30-day fast-track process initiated")
            print("   🚛 Immediate harvest operations authorized")
            
            # Create new sanitation harvest blocks with fast permits
            for i, block in enumerate(beetle_blocks):
                sanitation_block = HarvestBlock(
                    id=f"SANITATION-{block.id}",
                    volume_m3=int(block.volume_m3 * 0.7),  # 70% recoverable
                    year_planned=state.year,
                    permit_status=PermitStatus.APPROVED,  # Pre-approved for sanitation
                    disaster_affected=True,
                    disaster_type=DisasterType.BEETLE_KILL
                )
                state.harvest_blocks.append(sanitation_block)
                
                print(f"   📋 Sanitation block created: {sanitation_block.id} ({format_volume(sanitation_block.volume_m3)})")
            
            # Immediate partial revenue from salvage operations
            immediate_revenue = int(normal_revenue * 0.8)  # 80% of expected revenue
            state.budget += immediate_revenue
            state.total_revenue += immediate_revenue
            
            print(f"   💰 Immediate salvage revenue: {format_currency(immediate_revenue)}")
            print(f"   📈 Reputation boost for forest health management: +0.1")
            state.reputation += 0.1
            
        else:
            print(f"❌ Insufficient budget for sanitation permits!")
            print(f"   💸 Need {format_currency(reduced_stumpage_cost)}, have {format_currency(state.budget)}")
            
    elif choice == 1:  # Let wood deteriorate
        print("🪵 Beetle wood left to deteriorate naturally")
        print("   ⚠️  Lost economic opportunity")
        print("   🌱 Some ecological benefit as dead wood habitat")
        state.biodiversity_score += 0.02
        
    else:  # Wait for normal permits
        print("⏳ Waiting for standard permit process...")
        print("   📉 Risk: Beetle wood quality deteriorates 5% per quarter")
        print("   🐛 Risk: Beetle population may spread to healthy stands")
        
        # Add degradation risk to beetle blocks
        for block in beetle_blocks:
            block.volume_loss_percent += 0.05  # Additional 5% loss per quarter