"""
CEO Recommendation System
CEOs provide strategic recommendations requiring player approval before execution
"""

import random
from typing import List, Dict
from game_models import GameState, HarvestBlock, PermitStatus, CertificationType
from utils import ask, print_subsection, format_currency, format_volume
from ceo_system import CEOProfile


class CEORecommendation:
    def __init__(self, title: str, description: str, rationale: str, cost: int, 
                 immediate_effects: Dict, long_term_effects: Dict, risk_level: str,
                 success_chance: float, ceo_confidence: str):
        self.title = title
        self.description = description
        self.rationale = rationale  # CEO's reasoning
        self.cost = cost
        self.immediate_effects = immediate_effects
        self.long_term_effects = long_term_effects
        self.risk_level = risk_level  # "low", "medium", "high"
        self.success_chance = success_chance
        self.ceo_confidence = ceo_confidence  # "low", "medium", "high"


def ceo_quarterly_recommendations(state: GameState) -> bool:
    """CEO provides quarterly strategic recommendations requiring approval."""
    ceo = getattr(state, 'ceo', None)
    if ceo is None:
        return False
    
    # Generate recommendations based on CEO expertise and current situation
    recommendations = _generate_ceo_recommendations(state, ceo)
    
    if not recommendations:
        return False
    
    print_subsection(f"CEO STRATEGIC RECOMMENDATIONS - {ceo.name}")
    print(f"👔 '{ceo.name}: Based on our current position, I recommend the following strategic actions:'")
    
    for i, rec in enumerate(recommendations):
        risk_color = "🟢" if rec.risk_level == "low" else "🟡" if rec.risk_level == "medium" else "🔴"
        confidence_color = "🟢" if rec.ceo_confidence == "high" else "🟡" if rec.ceo_confidence == "medium" else "🔴"
        
        print(f"\n📋 RECOMMENDATION {i+1}: {rec.title}")
        print(f"   💡 Proposal: {rec.description}")
        print(f"   🧠 CEO Rationale: {rec.rationale}")
        print(f"   💰 Investment Required: {format_currency(rec.cost)}")
        print(f"   {risk_color} Risk Level: {rec.risk_level.upper()}")
        print(f"   {confidence_color} CEO Confidence: {rec.ceo_confidence.upper()} ({rec.success_chance*100:.0f}% success chance)")
        
        # Show immediate effects
        if rec.immediate_effects:
            print(f"   ⚡ Immediate Effects:")
            for effect, value in rec.immediate_effects.items():
                if isinstance(value, (int, float)) and value > 0:
                    print(f"      📈 {effect}: +{value}")
                elif isinstance(value, (int, float)) and value < 0:
                    print(f"      📉 {effect}: {value}")
                else:
                    print(f"      • {effect}: {value}")
        
        # Show long-term effects
        if rec.long_term_effects:
            print(f"   🔮 Long-term Benefits:")
            for effect, value in rec.long_term_effects.items():
                print(f"      🎯 {effect}: {value}")
    
    # Allow player to approve/reject each recommendation
    approved_recommendations = []
    total_cost = 0
    
    for i, rec in enumerate(recommendations):
        choices = ["Approve", "Reject", "Request more details", "Modify proposal"]
        choice = ask(f"Decision on '{rec.title}':", choices)
        
        if choice == 0:  # Approve
            if state.budget >= rec.cost:
                approved_recommendations.append(rec)
                total_cost += rec.cost
                print(f"✅ APPROVED: {rec.title}")
            else:
                print(f"❌ INSUFFICIENT BUDGET: Need {format_currency(rec.cost)}, have {format_currency(state.budget)}")
                
        elif choice == 1:  # Reject
            print(f"❌ REJECTED: {rec.title}")
            _ceo_reaction_to_rejection(ceo, rec)
            
        elif choice == 2:  # More details
            _explain_recommendation_details(rec, ceo)
            choice = ask(f"Now decide on '{rec.title}':", ["Approve", "Reject"])
            if choice == 0 and state.budget >= rec.cost:
                approved_recommendations.append(rec)
                total_cost += rec.cost
                print(f"✅ APPROVED: {rec.title}")
            else:
                print(f"❌ REJECTED: {rec.title}")
                
        else:  # Modify proposal
            modified_rec = _modify_recommendation(rec, ceo)
            if modified_rec and state.budget >= modified_rec.cost:
                approved_recommendations.append(modified_rec)
                total_cost += modified_rec.cost
                print(f"✅ APPROVED (Modified): {modified_rec.title}")
            else:
                print(f"❌ REJECTED: Unable to modify satisfactorily")
    
    # Execute approved recommendations
    if approved_recommendations:
        print(f"\n📋 EXECUTING {len(approved_recommendations)} APPROVED RECOMMENDATIONS")
        print(f"💰 Total Investment: {format_currency(total_cost)}")
        state.budget -= total_cost
        
        for rec in approved_recommendations:
            _execute_ceo_recommendation(state, rec, ceo)
        
        # CEO performance boost for approved recommendations
        ceo.performance_rating = min(1.0, ceo.performance_rating + 0.02 * len(approved_recommendations))
        
    else:
        print(f"\n📋 NO RECOMMENDATIONS APPROVED")
        _ceo_reaction_to_all_rejections(ceo)
        # CEO performance penalty for all rejections
        ceo.performance_rating = max(0.0, ceo.performance_rating - 0.05)
    
    return len(approved_recommendations) > 0


def _generate_ceo_recommendations(state: GameState, ceo: CEOProfile) -> List[CEORecommendation]:
    """Generate context-appropriate recommendations based on CEO expertise."""
    recommendations = []
    
    # Financial optimization recommendations (Alexandra Kowalski specialty)
    if "Financial optimization" in ceo.strengths:
        if state.operating_cost_per_m3 > 40:
            recommendations.append(CEORecommendation(
                title="Operational Efficiency Overhaul",
                description="Implement lean manufacturing principles and renegotiate contractor agreements",
                rationale="Our operating costs are 15% above industry average. I can leverage my Wall Street connections to bring in efficiency consultants.",
                cost=150000,
                immediate_effects={"Operating cost reduction": "$8/m³", "Staff layoffs": "15 positions"},
                long_term_effects={"Annual savings": "$400,000+", "Competitive advantage": "Significant"},
                risk_level="medium",
                success_chance=0.8,
                ceo_confidence="high"
            ))
        
        if state.revenue_per_m3 < 90:
            recommendations.append(CEORecommendation(
                title="Premium Market Penetration",
                description="Target high-end US and Asian markets with premium lumber grades",
                rationale="We're leaving money on the table. My international contacts can access luxury markets paying 50%+ premiums.",
                cost=200000,
                immediate_effects={"Revenue per m³": "+$12", "Marketing costs": "$50,000"},
                long_term_effects={"Market positioning": "Premium tier", "Customer loyalty": "High-value contracts"},
                risk_level="medium",
                success_chance=0.75,
                ceo_confidence="high"
            ))
    
    # Government relations recommendations (Margaret Chen specialty)
    if "Regulatory expertise" in ceo.strengths:
        pending_permits = len([b for b in state.harvest_blocks if b.permit_status == PermitStatus.PENDING])
        if pending_permits > 2:
            recommendations.append(CEORecommendation(
                title="Government Relations Blitz",
                description="Launch intensive lobbying campaign with my former Ministry colleagues",
                rationale="I know exactly which bureaucrats are creating bottlenecks. Strategic meetings and 'consulting fees' can accelerate everything.",
                cost=75000,
                immediate_effects={"Permit processing": "+50% speed", "Government relationships": "Enhanced"},
                long_term_effects={"Regulatory advantage": "Ongoing", "Industry reputation": "Government insider"},
                risk_level="low",
                success_chance=0.9,
                ceo_confidence="high"
            ))
        
        if state.permit_bonus < 0.15:
            recommendations.append(CEORecommendation(
                title="Regulatory Compliance Excellence Program",
                description="Implement gold-standard environmental and safety protocols",
                rationale="Perfect compliance creates regulatory goodwill. Inspectors will start fast-tracking our applications.",
                cost=120000,
                immediate_effects={"Compliance rating": "Excellent", "Permit bonus": "+0.1"},
                long_term_effects={"Regulatory trust": "Maximum", "Audit frequency": "Reduced"},
                risk_level="low",
                success_chance=0.85,
                ceo_confidence="high"
            ))
    
    # First Nations relations recommendations (James Running Bear specialty)
    if "First Nations relations" in ceo.strengths:
        poor_relations = [fn for fn in state.first_nations if fn.relationship_level < 0.6]
        if poor_relations:
            recommendations.append(CEORecommendation(
                title="Indigenous Partnership Initiative",
                description="Establish genuine co-management agreements with traditional knowledge integration",
                rationale="My community connections can repair these relationships. True partnership, not just consultation, creates long-term stability.",
                cost=180000,
                immediate_effects={"First Nations relationships": "+0.3 all", "Cultural protocols": "Implemented"},
                long_term_effects={"Partnership agreements": "Signed", "Community support": "Strong"},
                risk_level="low",
                success_chance=0.9,
                ceo_confidence="high"
            ))
        
        if not any(fn.agreement_signed for fn in state.first_nations):
            recommendations.append(CEORecommendation(
                title="Traditional Territory Revenue Sharing",
                description="Proactively offer 5% revenue sharing before it becomes mandatory",
                rationale="Revenue sharing is coming whether we like it or not. Getting ahead of legislation creates goodwill and negotiating power.",
                cost=0,  # No upfront cost, but reduces future profits
                immediate_effects={"Future revenue": "-5%", "Indigenous relations": "Transformed"},
                long_term_effects={"Legal challenges": "Eliminated", "Social license": "Secured"},
                risk_level="medium",
                success_chance=0.8,
                ceo_confidence="medium"
            ))
    
    # Environmental/certification recommendations (Dr. David Sustainability specialty)
    if "Certification expertise" in ceo.strengths:
        active_certs = state.get_active_certifications()
        if len(active_certs) < 2:
            recommendations.append(CEORecommendation(
                title="Triple Certification Strategy",
                description="Simultaneously pursue FSC, SFI, and PEFC certifications for maximum market access",
                rationale="My research shows certified timber commands 20-30% premiums. Multiple certifications open all premium markets.",
                cost=250000,
                immediate_effects={"Certification costs": "$250k", "Environmental audit": "Comprehensive"},
                long_term_effects={"Revenue premium": "25%+", "Market access": "Global premium markets"},
                risk_level="medium",
                success_chance=0.85,
                ceo_confidence="high"
            ))
        
        if state.biodiversity_score < 0.6:
            recommendations.append(CEORecommendation(
                title="Ecosystem Services Program",
                description="Monetize carbon storage, watershed protection, and biodiversity conservation",
                rationale="Environmental services are becoming valuable commodities. We can generate revenue while harvesting through ecosystem service credits.",
                cost=100000,
                immediate_effects={"Biodiversity score": "+0.2", "Environmental monitoring": "Advanced"},
                long_term_effects={"Carbon credit revenue": "$50k annually", "Environmental reputation": "Industry leader"},
                risk_level="low",
                success_chance=0.8,
                ceo_confidence="medium"
            ))
    
    # Universal recommendations based on company situation
    if state.budget > 3000000:  # High cash reserves
        recommendations.append(CEORecommendation(
            title="Aggressive Expansion Strategy",
            description="Acquire smaller competitors and unused tenure rights",
            rationale="We have the capital to consolidate the industry. Competitors are struggling - we can buy them cheap and eliminate competition.",
            cost=1500000,
            immediate_effects={"Market share": "Doubled", "Competition": "Reduced"},
            long_term_effects={"Industry dominance": "Regional monopoly", "Pricing power": "Significant"},
            risk_level="high",
            success_chance=0.7,
            ceo_confidence="medium"
        ))
    
    if state.reputation < 0.4:  # Poor reputation
        recommendations.append(CEORecommendation(
            title="Reputation Recovery Campaign",
            description="Hire top-tier PR firm and launch community investment program",
            rationale="Our reputation is toxic. Without social license, we'll face constant resistance. Investment in image is investment in operations.",
            cost=300000,
            immediate_effects={"Reputation": "+0.3", "Community programs": "Launched"},
            long_term_effects={"Social license": "Restored", "Opposition": "Reduced"},
            risk_level="low",
            success_chance=0.8,
            ceo_confidence="high"
        ))
    
    # Filter recommendations based on CEO risk tolerance
    filtered_recs = []
    for rec in recommendations:
        if ceo.risk_tolerance == "conservative" and rec.risk_level == "high":
            continue
        elif ceo.risk_tolerance == "aggressive" or rec.risk_level != "high":
            filtered_recs.append(rec)
    
    # Return 2-4 recommendations
    return random.sample(filtered_recs, min(random.randint(2, 4), len(filtered_recs)))


def _explain_recommendation_details(rec: CEORecommendation, ceo: CEOProfile):
    """Provide detailed explanation of CEO recommendation."""
    print(f"\n🔍 DETAILED ANALYSIS: {rec.title}")
    print(f"💡 Full Proposal: {rec.description}")
    print(f"🧠 CEO Analysis: {rec.rationale}")
    print(f"💰 Total Investment: {format_currency(rec.cost)}")
    print(f"📊 Success Probability: {rec.success_chance*100:.0f}%")
    
    print(f"\n📈 Expected Outcomes:")
    print(f"   Risk Level: {rec.risk_level.upper()}")
    print(f"   CEO Confidence: {rec.ceo_confidence.upper()}")
    
    if rec.immediate_effects:
        print(f"   Immediate Results:")
        for effect, value in rec.immediate_effects.items():
            print(f"      • {effect}: {value}")
    
    if rec.long_term_effects:
        print(f"   Long-term Benefits:")
        for effect, value in rec.long_term_effects.items():
            print(f"      • {effect}: {value}")
    
    # CEO-specific insights
    if "Financial optimization" in ceo.strengths:
        print(f"💼 Financial Perspective: ROI analysis shows positive returns within 18 months")
    elif "Regulatory expertise" in ceo.strengths:
        print(f"📋 Regulatory Perspective: Fully compliant with all current and proposed regulations")
    elif "First Nations relations" in ceo.strengths:
        print(f"🤝 Indigenous Perspective: Respects traditional protocols and builds genuine partnerships")
    elif "Certification expertise" in ceo.strengths:
        print(f"🌱 Environmental Perspective: Aligns with sustainability best practices")


def _modify_recommendation(rec: CEORecommendation, ceo: CEOProfile) -> CEORecommendation:
    """Allow player to modify CEO recommendation."""
    print(f"\n🔧 MODIFYING RECOMMENDATION: {rec.title}")
    
    modification_options = [
        "Reduce scope and cost by 50%",
        "Increase timeline to reduce risk",
        "Add additional safeguards",
        "Focus only on highest-impact elements",
        "Cancel modification"
    ]
    
    choice = ask("How would you like to modify this recommendation?", modification_options)
    
    if choice == 0:  # Reduce scope
        rec.cost = int(rec.cost * 0.5)
        rec.success_chance *= 0.8
        for effect, value in rec.immediate_effects.items():
            if isinstance(value, (int, float)):
                rec.immediate_effects[effect] = value * 0.6
        print(f"✅ Scope reduced. New cost: {format_currency(rec.cost)}")
        return rec
        
    elif choice == 1:  # Increase timeline
        rec.risk_level = "low" if rec.risk_level == "medium" else "medium"
        rec.success_chance = min(0.95, rec.success_chance + 0.1)
        print(f"✅ Timeline extended. Risk reduced to {rec.risk_level}")
        return rec
        
    elif choice == 2:  # Add safeguards
        rec.cost = int(rec.cost * 1.2)
        rec.success_chance = min(0.95, rec.success_chance + 0.15)
        rec.risk_level = "low" if rec.risk_level == "medium" else "medium"
        print(f"✅ Safeguards added. New cost: {format_currency(rec.cost)}")
        return rec
        
    elif choice == 3:  # Focus on highest impact
        rec.cost = int(rec.cost * 0.7)
        # Keep only the most significant immediate effect
        if rec.immediate_effects:
            best_effect = max(rec.immediate_effects.items(), key=lambda x: abs(x[1]) if isinstance(x[1], (int, float)) else 1)
            rec.immediate_effects = {best_effect[0]: best_effect[1]}
        print(f"✅ Focused approach. New cost: {format_currency(rec.cost)}")
        return rec
    
    return None  # Cancel modification


def _execute_ceo_recommendation(state: GameState, rec: CEORecommendation, ceo: CEOProfile):
    """Execute an approved CEO recommendation."""
    print(f"\n🔧 IMPLEMENTING: {rec.title}")
    
    # Roll for success
    if random.random() < rec.success_chance:
        print(f"✅ IMPLEMENTATION SUCCESSFUL!")
        success_multiplier = 1.0
    else:
        print(f"⚠️  PARTIAL SUCCESS - Some challenges encountered")
        success_multiplier = 0.6
    
    # Apply immediate effects
    for effect, value in rec.immediate_effects.items():
        actual_value = value * success_multiplier if isinstance(value, (int, float)) else value
        
        if effect == "Operating cost reduction":
            cost_reduction = int(actual_value.replace("$", "").replace("/m³", ""))
            state.operating_cost_per_m3 -= cost_reduction
            print(f"📈 Operating costs reduced by ${cost_reduction}/m³")
            
        elif effect == "Revenue per m³":
            revenue_increase = int(actual_value.replace("+$", ""))
            state.revenue_per_m3 += revenue_increase
            print(f"📈 Revenue increased by ${revenue_increase}/m³")
            
        elif effect == "Permit bonus":
            bonus_increase = float(actual_value.replace("+", ""))
            state.permit_bonus += bonus_increase
            print(f"📈 Permit processing improved by {bonus_increase}")
            
        elif effect == "First Nations relationships":
            relationship_boost = float(actual_value.replace("+", "").split()[0])
            for fn in state.first_nations:
                fn.relationship_level = min(1.0, fn.relationship_level + relationship_boost)
            print(f"📈 All First Nations relationships improved by {relationship_boost}")
            
        elif effect == "Reputation":
            reputation_boost = float(actual_value.replace("+", ""))
            state.reputation = min(1.0, state.reputation + reputation_boost)
            print(f"📈 Company reputation improved by {reputation_boost}")
            
        elif effect == "Biodiversity score":
            bio_boost = float(actual_value.replace("+", ""))
            state.biodiversity_score = min(1.0, state.biodiversity_score + bio_boost)
            print(f"📈 Biodiversity score improved by {bio_boost}")
        
        else:
            print(f"📋 {effect}: {actual_value}")
    
    # CEO gets performance boost for successful implementations
    if success_multiplier >= 1.0:
        ceo.performance_rating = min(1.0, ceo.performance_rating + 0.05)
        print(f"👔 {ceo.name}'s performance rating increased to {ceo.performance_rating:.2f}")


def _ceo_reaction_to_rejection(ceo: CEOProfile, rec: CEORecommendation):
    """CEO reacts to having their recommendation rejected."""
    reactions = {
        "Financial optimization": [
            f"👔 '{ceo.name}: I understand the conservative approach, but we're missing profit opportunities.'",
            f"💼 '{ceo.name}: The numbers don't lie - this was a solid ROI proposition.'",
            f"📊 '{ceo.name}: Market timing is critical. These opportunities won't last forever.'"
        ],
        "Regulatory expertise": [
            f"👔 '{ceo.name}: I respect your decision, but regulatory compliance is not optional.'",
            f"📋 '{ceo.name}: My government experience says this will become mandatory eventually.'",
            f"⚖️ '{ceo.name}: Being proactive with regulators always pays dividends.'"
        ],
        "First Nations relations": [
            f"👔 '{ceo.name}: I understand budget constraints, but relationships take time to build.'",
            f"🤝 '{ceo.name}: From my community perspective, this sends the wrong message.'",
            f"🌟 '{ceo.name}: Genuine partnership is more valuable than short-term savings.'"
        ],
        "Certification expertise": [
            f"👔 '{ceo.name}: Environmental leadership requires investment, but the returns are substantial.'",
            f"🌱 '{ceo.name}: The market is moving toward sustainability - we need to lead, not follow.'",
            f"📈 '{ceo.name}: Certification premiums more than offset the costs in my analysis.'"
        ]
    }
    
    # Find CEO's primary strength and react accordingly
    for strength in ceo.strengths:
        if strength in reactions:
            print(random.choice(reactions[strength]))
            break
    else:
        print(f"👔 '{ceo.name}: I disagree with this decision, but I respect your authority as owner.'")


def _ceo_reaction_to_all_rejections(ceo: CEOProfile):
    """CEO reacts to having all recommendations rejected."""
    print(f"\n💔 CEO DISAPPOINTMENT:")
    
    if ceo.performance_rating > 0.7:
        print(f"👔 '{ceo.name}: I'm surprised by the rejection of all my recommendations. My track record speaks for itself.'")
        print(f"💼 'Perhaps we need to discuss strategic alignment in our next review.'")
    elif ceo.performance_rating > 0.4:
        print(f"👔 '{ceo.name}: I understand you have different priorities. I'll focus on operational efficiency.'")
        print(f"📋 'But strategic opportunities like these don't come often.'")
    else:
        print(f"👔 '{ceo.name}: Clearly my strategic vision doesn't align with company direction.'")
        print(f"💸 'I may need to consider other opportunities if this continues.'")
        
        # Poor performing CEO with all rejections might threaten to quit
        if random.random() < 0.3:
            print(f"⚠️ WARNING: {ceo.name} is considering resignation due to lack of strategic input!")