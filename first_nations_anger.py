"""
First Nations Anger Events System
Handles random anger events where First Nations get upset about various issues
"""

import random
from typing import List, Dict
from game_models import GameState, FirstNation
from utils import ask, print_subsection, format_currency


class AngerEvent:
    def __init__(self, title: str, description: str, trigger_reason: str, 
                 relationship_penalty: float, reputation_penalty: float, 
                 response_options: List[Dict], complexity: str = "simple"):
        self.title = title
        self.description = description
        self.trigger_reason = trigger_reason
        self.relationship_penalty = relationship_penalty
        self.reputation_penalty = reputation_penalty
        self.response_options = response_options  # List of dicts with cost, effectiveness, description
        self.complexity = complexity


def random_first_nations_anger_events(state: GameState) -> bool:
    """Generate random First Nations anger events to create more interaction."""
    if random.random() > 0.3:  # 30% chance each quarter
        return False
    
    # Only trigger if we have First Nations to get angry
    if not state.first_nations:
        return False
    
    # Select a random First Nation to get angry
    angry_fn = random.choice(state.first_nations)
    
    print_subsection(f"🚨 FIRST NATIONS ANGER EVENT - {angry_fn.name}")
    
    # Generate context-specific anger events
    anger_events = [
        AngerEvent(
            title="Social Media Outrage",
            description=f"A viral TikTok video shows your equipment near a traditional fishing spot. {angry_fn.name} youth are organizing protests.",
            trigger_reason="Cultural site disrespect",
            relationship_penalty=0.3,
            reputation_penalty=0.2,
            response_options=[
                {
                    "description": "Issue public apology and relocate operations",
                    "cost": 25000,
                    "relationship_recovery": 0.2,
                    "reputation_recovery": 0.1,
                    "success_chance": 0.8
                },
                {
                    "description": "Hire Indigenous social media manager to respond",
                    "cost": 15000,
                    "relationship_recovery": 0.1,
                    "reputation_recovery": 0.15,
                    "success_chance": 0.6
                },
                {
                    "description": "Ignore the controversy and continue operations",
                    "cost": 0,
                    "relationship_recovery": -0.1,
                    "reputation_recovery": -0.1,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Spiritual Site Disturbance",
            description=f"Your workers unknowingly damaged a prayer site. {angry_fn.name} elders are demanding immediate action.",
            trigger_reason="Sacred site violation",
            relationship_penalty=0.4,
            reputation_penalty=0.3,
            response_options=[
                {
                    "description": "Fund traditional healing ceremony and site restoration",
                    "cost": 50000,
                    "relationship_recovery": 0.3,
                    "reputation_recovery": 0.2,
                    "success_chance": 0.9
                },
                {
                    "description": "Offer monetary compensation to the community",
                    "cost": 75000,
                    "relationship_recovery": 0.1,
                    "reputation_recovery": 0.1,
                    "success_chance": 0.5
                },
                {
                    "description": "Claim ignorance and minimal cleanup only",
                    "cost": 5000,
                    "relationship_recovery": -0.2,
                    "reputation_recovery": -0.2,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Employment Discrimination Allegation",
            description=f"A {angry_fn.name} member claims they were passed over for promotion due to racism. The story is spreading.",
            trigger_reason="Employment practices",
            relationship_penalty=0.25,
            reputation_penalty=0.35,
            response_options=[
                {
                    "description": "Hire external Indigenous employment equity consultant",
                    "cost": 40000,
                    "relationship_recovery": 0.2,
                    "reputation_recovery": 0.25,
                    "success_chance": 0.8
                },
                {
                    "description": "Promote Indigenous employee and implement diversity training",
                    "cost": 20000,
                    "relationship_recovery": 0.15,
                    "reputation_recovery": 0.15,
                    "success_chance": 0.7
                },
                {
                    "description": "Deny allegations and threaten legal action",
                    "cost": 10000,
                    "relationship_recovery": -0.3,
                    "reputation_recovery": -0.2,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Wildlife Corridor Blockage",
            description=f"Your access road has cut off traditional hunting grounds used by {angry_fn.name} for generations.",
            trigger_reason="Traditional land use interference",
            relationship_penalty=0.2,
            reputation_penalty=0.15,
            response_options=[
                {
                    "description": "Build wildlife overpass and alternative hunting access",
                    "cost": 80000,
                    "relationship_recovery": 0.25,
                    "reputation_recovery": 0.2,
                    "success_chance": 0.9
                },
                {
                    "description": "Provide alternate hunting areas and transportation",
                    "cost": 30000,
                    "relationship_recovery": 0.15,
                    "reputation_recovery": 0.1,
                    "success_chance": 0.7
                },
                {
                    "description": "Claim road is temporary and will be removed 'eventually'",
                    "cost": 0,
                    "relationship_recovery": -0.1,
                    "reputation_recovery": -0.05,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Water Quality Concerns",
            description=f"Recent water testing near your operations shows elevated sediment. {angry_fn.name} suspects contamination.",
            trigger_reason="Environmental concerns",
            relationship_penalty=0.35,
            reputation_penalty=0.4,
            response_options=[
                {
                    "description": "Fund independent water study and remediation if needed",
                    "cost": 60000,
                    "relationship_recovery": 0.3,
                    "reputation_recovery": 0.35,
                    "success_chance": 0.85
                },
                {
                    "description": "Install water monitoring stations jointly with the community",
                    "cost": 35000,
                    "relationship_recovery": 0.2,
                    "reputation_recovery": 0.2,
                    "success_chance": 0.75
                },
                {
                    "description": "Blame natural seasonal variation and do nothing",
                    "cost": 0,
                    "relationship_recovery": -0.2,
                    "reputation_recovery": -0.25,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Cultural Protocol Violation",
            description=f"Your crew started work during {angry_fn.name} mourning period. The community is deeply offended.",
            trigger_reason="Cultural insensitivity",
            relationship_penalty=0.3,
            reputation_penalty=0.25,
            response_options=[
                {
                    "description": "Stop all operations and fund cultural awareness training",
                    "cost": 45000,
                    "relationship_recovery": 0.25,
                    "reputation_recovery": 0.2,
                    "success_chance": 0.8
                },
                {
                    "description": "Apologize formally and reschedule operations",
                    "cost": 15000,
                    "relationship_recovery": 0.15,
                    "reputation_recovery": 0.1,
                    "success_chance": 0.6
                },
                {
                    "description": "Continue operations - 'business is business'",
                    "cost": 0,
                    "relationship_recovery": -0.2,
                    "reputation_recovery": -0.15,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Youth Activist Incident",
            description=f"Young {angry_fn.name} activists have chained themselves to your harvesting equipment to protest old-growth logging.",
            trigger_reason="Environmental activism",
            relationship_penalty=0.25,
            reputation_penalty=0.3,
            response_options=[
                {
                    "description": "Meet with youth leaders and develop co-management plan",
                    "cost": 35000,
                    "relationship_recovery": 0.2,
                    "reputation_recovery": 0.25,
                    "success_chance": 0.7
                },
                {
                    "description": "Offer summer jobs program for Indigenous youth",
                    "cost": 50000,
                    "relationship_recovery": 0.3,
                    "reputation_recovery": 0.2,
                    "success_chance": 0.8
                },
                {
                    "description": "Call police to remove protesters",
                    "cost": 5000,
                    "relationship_recovery": -0.3,
                    "reputation_recovery": -0.4,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Treaty Rights Dispute",
            description=f"{angry_fn.name} claims your operations violate their constitutionally protected Treaty rights to harvest forest resources.",
            trigger_reason="Constitutional rights violation",
            relationship_penalty=0.4,
            reputation_penalty=0.5,
            response_options=[
                {
                    "description": "Engage constitutional lawyer and negotiate sharing agreement",
                    "cost": 100000,
                    "relationship_recovery": 0.35,
                    "reputation_recovery": 0.4,
                    "success_chance": 0.9
                },
                {
                    "description": "Offer revenue sharing from current operations",
                    "cost": 80000,
                    "relationship_recovery": 0.25,
                    "reputation_recovery": 0.2,
                    "success_chance": 0.7
                },
                {
                    "description": "Dispute their claim and continue operations",
                    "cost": 25000,
                    "relationship_recovery": -0.4,
                    "reputation_recovery": -0.3,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Missing and Murdered Indigenous Women Awareness",
            description=f"MMIW advocates from {angry_fn.name} demand your company support safety initiatives after a worker safety incident.",
            trigger_reason="Worker safety and social justice",
            relationship_penalty=0.2,
            reputation_penalty=0.3,
            response_options=[
                {
                    "description": "Fund MMIW awareness program and safety initiatives",
                    "cost": 30000,
                    "relationship_recovery": 0.2,
                    "reputation_recovery": 0.25,
                    "success_chance": 0.85
                },
                {
                    "description": "Implement comprehensive safety protocols for all workers",
                    "cost": 20000,
                    "relationship_recovery": 0.1,
                    "reputation_recovery": 0.15,
                    "success_chance": 0.7
                },
                {
                    "description": "Argue this is not your responsibility",
                    "cost": 0,
                    "relationship_recovery": -0.15,
                    "reputation_recovery": -0.2,
                    "success_chance": 1.0
                }
            ]
        ),
        
        AngerEvent(
            title="Traditional Knowledge Appropriation",
            description=f"Your company published research using {angry_fn.name} traditional ecological knowledge without proper credit or permission.",
            trigger_reason="Intellectual property violation",
            relationship_penalty=0.3,
            reputation_penalty=0.25,
            response_options=[
                {
                    "description": "Formally acknowledge Indigenous knowledge and share research royalties",
                    "cost": 40000,
                    "relationship_recovery": 0.25,
                    "reputation_recovery": 0.2,
                    "success_chance": 0.8
                },
                {
                    "description": "Establish formal traditional knowledge protocols for future",
                    "cost": 25000,
                    "relationship_recovery": 0.15,
                    "reputation_recovery": 0.15,
                    "success_chance": 0.7
                },
                {
                    "description": "Claim knowledge was already public domain",
                    "cost": 0,
                    "relationship_recovery": -0.2,
                    "reputation_recovery": -0.15,
                    "success_chance": 1.0
                }
            ]
        )
    ]
    
    # Choose an appropriate anger event based on current context
    available_events = []
    
    # Always add general events
    available_events.extend(anger_events[:6])
    
    # Add context-specific events
    if any(block.old_growth_affected for block in state.harvest_blocks):
        available_events.append(anger_events[6])  # Youth activist incident
    
    if angry_fn.relationship_level < 0.4:
        available_events.append(anger_events[7])  # Treaty rights dispute
    
    if state.reputation < 0.6:
        available_events.extend([anger_events[8], anger_events[9]])  # MMIW and traditional knowledge
    
    # Select random event
    chosen_event = random.choice(available_events)
    
    print(f"💢 ANGER TRIGGER: {chosen_event.trigger_reason}")
    print(f"📰 {chosen_event.description}")
    print(f"")
    print(f"⚠️  Immediate impacts:")
    print(f"   📉 Relationship with {angry_fn.name}: -{chosen_event.relationship_penalty:.2f}")
    print(f"   📉 Company reputation: -{chosen_event.reputation_penalty:.2f}")
    
    # Apply immediate penalties
    angry_fn.relationship_level = max(0.0, angry_fn.relationship_level - chosen_event.relationship_penalty)
    state.reputation = max(0.0, state.reputation - chosen_event.reputation_penalty)
    
    print(f"")
    print(f"🤔 How do you respond to this crisis?")
    
    # Present response options
    for i, option in enumerate(chosen_event.response_options):
        cost_text = f" (Cost: {format_currency(option['cost'])})" if option['cost'] > 0 else " (FREE)"
        success_text = f" - {option['success_chance']*100:.0f}% success chance"
        print(f"{i+1}. {option['description']}{cost_text}{success_text}")
    
    choice = ask("Choose your response:", [opt['description'] for opt in chosen_event.response_options])
    chosen_response = chosen_event.response_options[choice]
    
    print(f"")
    print(f"🎯 RESPONSE: {chosen_response['description']}")
    
    # Handle costs
    if chosen_response['cost'] > 0:
        if state.budget >= chosen_response['cost']:
            state.budget -= chosen_response['cost']
            print(f"💰 Cost: {format_currency(chosen_response['cost'])} paid")
        else:
            print(f"❌ Insufficient budget! Need {format_currency(chosen_response['cost'])}")
            print(f"🚨 Your inability to respond properly makes the situation WORSE!")
            angry_fn.relationship_level = max(0.0, angry_fn.relationship_level - 0.2)
            state.reputation = max(0.0, state.reputation - 0.15)
            return True
    
    # Roll for success
    if random.random() < chosen_response['success_chance']:
        print(f"✅ RESPONSE SUCCESSFUL!")
        
        # Apply recovery effects
        if chosen_response['relationship_recovery'] > 0:
            angry_fn.relationship_level = min(1.0, angry_fn.relationship_level + chosen_response['relationship_recovery'])
            print(f"📈 Relationship with {angry_fn.name} improved: +{chosen_response['relationship_recovery']:.2f}")
        elif chosen_response['relationship_recovery'] < 0:
            angry_fn.relationship_level = max(0.0, angry_fn.relationship_level + chosen_response['relationship_recovery'])
            print(f"📉 Relationship with {angry_fn.name} worsened further: {chosen_response['relationship_recovery']:.2f}")
        
        if chosen_response['reputation_recovery'] > 0:
            state.reputation = min(1.0, state.reputation + chosen_response['reputation_recovery'])
            print(f"📈 Company reputation improved: +{chosen_response['reputation_recovery']:.2f}")
        elif chosen_response['reputation_recovery'] < 0:
            state.reputation = max(0.0, state.reputation + chosen_response['reputation_recovery'])
            print(f"📉 Company reputation damaged further: {chosen_response['reputation_recovery']:.2f}")
            
        # Special bonus effects for particularly good responses
        if chosen_response['cost'] > 50000 and chosen_response['success_chance'] > 0.8:
            print(f"🌟 EXCEPTIONAL RESPONSE: Your commitment to reconciliation is noticed by other communities")
            for fn in state.first_nations:
                if fn != angry_fn:
                    fn.relationship_level = min(1.0, fn.relationship_level + 0.05)
    else:
        print(f"❌ RESPONSE FAILED!")
        print(f"😤 Your response was seen as inadequate or insincere")
        
        # Additional penalties for failed responses
        angry_fn.relationship_level = max(0.0, angry_fn.relationship_level - 0.1)
        state.reputation = max(0.0, state.reputation - 0.1)
        print(f"📉 Additional relationship damage: -0.1")
        print(f"📉 Additional reputation damage: -0.1")
        
        # Failed expensive responses are especially damaging
        if chosen_response['cost'] > 30000:
            print(f"💸 Expensive failed response creates additional backlash!")
            state.reputation = max(0.0, state.reputation - 0.05)
    
    # Long-term consequences
    print(f"")
    print(f"📊 Current status with {angry_fn.name}: {angry_fn.relationship_level:.2f}/1.0")
    print(f"📊 Current company reputation: {state.reputation:.2f}/1.0")
    
    # Warning about relationship degradation
    if angry_fn.relationship_level < 0.3:
        print(f"⚠️  WARNING: {angry_fn.name} relationship is critically damaged!")
        print(f"🚨 Further incidents could lead to permit challenges or blockades")
    elif angry_fn.relationship_level < 0.5:
        print(f"⚠️  CAUTION: {angry_fn.name} relationship needs attention")
    
    return True


def check_anger_event_triggers(state: GameState) -> bool:
    """Check if current conditions should trigger guaranteed anger events."""
    # Trigger anger if relationships are deteriorating
    for fn in state.first_nations:
        if fn.relationship_level < 0.2:
            if random.random() < 0.8:  # 80% chance if relationship is very bad
                return True
    
    # Trigger anger if reputation is very poor
    if state.reputation < 0.3:
        if random.random() < 0.6:  # 60% chance if reputation is poor
            return True
    
    # Trigger anger if cumulative disturbance is high
    if state.cumulative_disturbance > state.disturbance_cap * 0.8:
        if random.random() < 0.4:  # 40% chance if environmental impact is high
            return True
    
    return False