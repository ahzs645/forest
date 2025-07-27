"""
First Nations Liaison System
Allows hiring liaisons to provide automated consultation suggestions
"""

import random
from typing import List, Dict
from game_models import GameState, FirstNation
from utils import ask, print_subsection, format_currency, calculate_relationship_text


class LiaisonType:
    def __init__(self, name: str, cost: int, effectiveness: float, bias: str, description: str):
        self.name = name
        self.cost = cost
        self.effectiveness = effectiveness  # 0-1 how good their suggestions are
        self.bias = bias
        self.description = description


class Suggestion:
    def __init__(self, title: str, description: str, cost: int, fn_impact: float, 
                 reputation_impact: float, success_chance: float):
        self.title = title
        self.description = description
        self.cost = cost
        self.fn_impact = fn_impact
        self.reputation_impact = reputation_impact
        self.success_chance = success_chance


def liaison_management(state: GameState):
    """Manage First Nations liaison hiring and suggestions."""
    current_liaison = getattr(state, 'fn_liaison', None)
    
    if current_liaison is None:
        print("📞 No First Nations liaison currently employed")
        _offer_liaison_hiring(state)
    else:
        print(f"📞 Current liaison: {current_liaison.name}")
        _liaison_suggestions(state, current_liaison)


def _offer_liaison_hiring(state: GameState):
    """Offer different types of liaison for hire."""
    print_subsection("FIRST NATIONS LIAISON SERVICES")
    print("Hire a liaison to handle First Nations consultation and provide strategic advice")
    
    liaison_types = [
        LiaisonType(
            name="Indigenous Relations Specialist",
            cost=80000,
            effectiveness=0.9,
            bias="indigenous",
            description="First Nations member with deep cultural knowledge and community connections"
        ),
        LiaisonType(
            name="Corporate Consultant", 
            cost=60000,
            effectiveness=0.6,
            bias="corporate",
            description="Non-Indigenous consultant with business focus and government connections"
        ),
        LiaisonType(
            name="Mixed Advisory Team",
            cost=120000,
            effectiveness=0.95,
            bias="balanced",
            description="Indigenous and non-Indigenous team providing comprehensive perspective"
        )
    ]
    
    print("Available liaison options:")
    for i, liaison in enumerate(liaison_types):
        print(f"\n{i+1}. {liaison.name} - {format_currency(liaison.cost)}/year")
        print(f"   📝 {liaison.description}")
        print(f"   📊 Effectiveness: {liaison.effectiveness*100:.0f}%")
        
        if liaison.bias == "indigenous":
            print(f"   ✅ Excellent cultural sensitivity and community trust")
            print(f"   ⚠️  May prioritize Indigenous interests over corporate profits")
        elif liaison.bias == "corporate":
            print(f"   ✅ Strong focus on business objectives and cost efficiency")
            print(f"   ⚠️  May miss cultural nuances and community concerns")
        else:
            print(f"   ✅ Balanced perspective considering all stakeholders")
            print(f"   ⚠️  Higher cost but comprehensive approach")
    
    options = [f"Hire {liaison.name}" for liaison in liaison_types]
    options.append("Skip liaison hiring this quarter")
    
    choice = ask("Choose liaison approach:", options)
    
    if choice < len(liaison_types):
        chosen_liaison = liaison_types[choice]
        
        if state.budget < chosen_liaison.cost:
            print(f"❌ Insufficient budget! Need {format_currency(chosen_liaison.cost)}")
            return
        
        state.budget -= chosen_liaison.cost
        state.fn_liaison = chosen_liaison
        print(f"✅ {chosen_liaison.name} hired!")
        print(f"💰 Annual cost: {format_currency(chosen_liaison.cost)}")
        print(f"📞 They will provide consultation suggestions each quarter")
        
        # Immediate relationship boost
        for fn in state.first_nations:
            if chosen_liaison.bias == "indigenous":
                fn.relationship_level += 0.2
            elif chosen_liaison.bias == "balanced":
                fn.relationship_level += 0.1
            else:  # corporate
                fn.relationship_level += 0.05
        
        state.reputation += 0.1
    else:
        print("📋 No liaison hired this quarter")


def _liaison_suggestions(state: GameState, liaison: LiaisonType):
    """Liaison provides suggestions for First Nations relations."""
    print_subsection(f"LIAISON RECOMMENDATIONS - {liaison.name}")
    
    # Generate suggestions based on current situation and liaison type
    suggestions = _generate_suggestions(state, liaison)
    
    if not suggestions:
        print("📝 No specific recommendations this quarter")
        print("✅ Current First Nations relationships are well-managed")
        return
    
    print(f"Your {liaison.name} provides the following recommendations:")
    
    for i, suggestion in enumerate(suggestions):
        success_indicator = "🟢" if suggestion.success_chance > 0.7 else "🟡" if suggestion.success_chance > 0.4 else "🔴"
        
        print(f"\n{i+1}. {suggestion.title}")
        print(f"   📝 {suggestion.description}")
        print(f"   💰 Cost: {format_currency(suggestion.cost)}")
        print(f"   {success_indicator} Success likelihood: {suggestion.success_chance*100:.0f}%")
        if suggestion.fn_impact > 0:
            print(f"   📈 Expected relationship improvement: +{suggestion.fn_impact:.2f}")
        if suggestion.reputation_impact > 0:
            print(f"   🌟 Reputation impact: +{suggestion.reputation_impact:.2f}")
    
    # Allow player to approve/deny each suggestion
    approved_suggestions = []
    
    for i, suggestion in enumerate(suggestions):
        choice = ask(f"Approve: {suggestion.title}?", ["Yes", "No", "Need more details"])
        
        if choice == 0:  # Approved
            if state.budget >= suggestion.cost:
                approved_suggestions.append(suggestion)
                print(f"✅ Approved: {suggestion.title}")
            else:
                print(f"❌ Insufficient budget for {suggestion.title}")
        elif choice == 1:  # Denied
            print(f"❌ Denied: {suggestion.title}")
        else:  # More details
            _explain_suggestion_details(suggestion, liaison)
            choice = ask(f"Now approve: {suggestion.title}?", ["Yes", "No"])
            if choice == 0 and state.budget >= suggestion.cost:
                approved_suggestions.append(suggestion)
                print(f"✅ Approved: {suggestion.title}")
    
    # Execute approved suggestions
    if approved_suggestions:
        print(f"\n📋 Executing {len(approved_suggestions)} approved recommendations:")
        _execute_suggestions(state, approved_suggestions, liaison)
    else:
        print(f"\n📋 No recommendations approved this quarter")
        
        # Liaison may comment on rejections
        if len(suggestions) > 0:
            _liaison_reaction_to_rejections(liaison)


def _generate_suggestions(state: GameState, liaison: LiaisonType) -> List[Suggestion]:
    """Generate contextual suggestions based on current game state."""
    suggestions = []
    
    # Check for First Nations needing attention
    poor_relations = [fn for fn in state.first_nations if fn.relationship_level < 0.4]
    strained_relations = [fn for fn in state.first_nations if 0.4 <= fn.relationship_level < 0.6]
    
    if poor_relations:
        if liaison.bias == "indigenous":
            suggestions.append(Suggestion(
                "Emergency Relationship Repair",
                f"Immediate cultural ceremony and formal apology to {poor_relations[0].name}",
                cost=50000,
                fn_impact=0.3,
                reputation_impact=0.15,
                success_chance=0.8
            ))
        else:
            suggestions.append(Suggestion(
                "Diplomatic Damage Control",
                f"Professional mediation and compensation offer to {poor_relations[0].name}",
                cost=75000,
                fn_impact=0.2,
                reputation_impact=0.1,
                success_chance=0.6
            ))
    
    if strained_relations:
        if liaison.bias == "corporate":
            suggestions.append(Suggestion(
                "Strategic Partnership Development",
                f"Joint venture proposal with {strained_relations[0].name} for mutual benefit",
                cost=40000,
                fn_impact=0.15,
                reputation_impact=0.05,
                success_chance=0.7
            ))
        elif liaison.bias == "indigenous":
            suggestions.append(Suggestion(
                "Cultural Exchange Program", 
                f"Employee cultural training and traditional knowledge sharing with {strained_relations[0].name}",
                cost=25000,
                fn_impact=0.2,
                reputation_impact=0.1,
                success_chance=0.85
            ))
        else:  # balanced
            suggestions.append(Suggestion(
                "Collaborative Monitoring Initiative",
                f"Joint environmental monitoring program with {strained_relations[0].name}",
                cost=35000,
                fn_impact=0.18,
                reputation_impact=0.08,
                success_chance=0.75
            ))
    
    # Proactive suggestions
    if state.cumulative_disturbance > state.disturbance_cap * 0.6:
        if liaison.bias == "indigenous":
            suggestions.append(Suggestion(
                "Traditional Ecological Restoration",
                "Indigenous-led habitat restoration using traditional methods",
                cost=60000,
                fn_impact=0.25,
                reputation_impact=0.2,
                success_chance=0.9
            ))
    
    # Certification opportunity
    if not state.get_active_certifications() and state.reputation > 0.5:
        if liaison.bias != "corporate":
            suggestions.append(Suggestion(
                "Indigenous Partnership Certification",
                "Apply for specialized Indigenous partnership certification",
                cost=80000,
                fn_impact=0.1,
                reputation_impact=0.25,
                success_chance=0.8
            ))
    
    return suggestions


def _explain_suggestion_details(suggestion: Suggestion, liaison: LiaisonType):
    """Provide detailed explanation of a suggestion."""
    print(f"\n🔍 DETAILED ANALYSIS: {suggestion.title}")
    print(f"📋 Full description: {suggestion.description}")
    
    if liaison.bias == "indigenous":
        print(f"🌟 Cultural perspective: This approach honors traditional protocols")
        print(f"🤝 Community impact: Strong positive reception expected")
    elif liaison.bias == "corporate":
        print(f"💼 Business perspective: Cost-effective approach with clear ROI")
        print(f"📊 Risk analysis: Calculated business decision")
    else:
        print(f"⚖️  Balanced analysis: Considers both cultural and business factors")
        print(f"🎯 Strategic value: Addresses multiple stakeholder interests")
    
    print(f"⏱️  Timeline: Implementation within this quarter")
    print(f"📈 Long-term benefits: Improved operational stability")


def _execute_suggestions(state: GameState, suggestions: List[Suggestion], liaison: LiaisonType):
    """Execute approved suggestions and apply their effects."""
    total_cost = sum(s.cost for s in suggestions)
    state.budget -= total_cost
    
    print(f"💰 Total investment: {format_currency(total_cost)}")
    
    for suggestion in suggestions:
        print(f"\n🔧 Implementing: {suggestion.title}")
        
        # Roll for success
        if random.random() < suggestion.success_chance:
            print(f"✅ SUCCESS: {suggestion.description}")
            
            # Apply positive effects
            for fn in state.first_nations:
                fn.relationship_level = min(1.0, fn.relationship_level + suggestion.fn_impact)
            
            state.reputation += suggestion.reputation_impact
            
            # Bonus effects based on liaison type
            if liaison.bias == "indigenous" and suggestion.fn_impact > 0.2:
                print(f"🌟 BONUS: Cultural authenticity creates lasting trust")
                state.reputation += 0.05
            elif liaison.bias == "balanced":
                print(f"🎯 BONUS: Comprehensive approach yields additional benefits")
                state.biodiversity_score += 0.02
                
        else:
            print(f"❌ PARTIAL SUCCESS: Some challenges encountered")
            
            # Apply reduced effects
            for fn in state.first_nations:
                fn.relationship_level = min(1.0, fn.relationship_level + suggestion.fn_impact * 0.5)
            
            state.reputation += suggestion.reputation_impact * 0.5


def _liaison_reaction_to_rejections(liaison: LiaisonType):
    """Liaison reacts to having their suggestions rejected."""
    if liaison.bias == "indigenous":
        reactions = [
            "⚠️  Your liaison warns: 'Ignoring relationship building may harm long-term partnerships'",
            "😔 'The communities will notice this lack of investment in the relationship'",
            "📞 'I recommend reconsidering - relationships take time to rebuild once damaged'"
        ]
    elif liaison.bias == "corporate":
        reactions = [
            "📊 Your consultant notes: 'These calculated risks may affect operational efficiency'",
            "💼 'From a business perspective, prevention is cheaper than crisis management'",
            "⚠️  'The ROI on relationship investment typically pays off in permit approvals'"
        ]
    else:  # balanced
        reactions = [
            "🎯 Your team advises: 'Balancing stakeholder interests requires ongoing investment'",
            "⚖️  'Both cultural and business factors suggest these investments are valuable'",
            "📈 'Long-term sustainability depends on maintaining these relationships'"
        ]
    
    print(random.choice(reactions))