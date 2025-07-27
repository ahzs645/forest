"""
CEO Management System
Allows hiring a CEO to make automated decisions with profit sharing
"""

import random
from typing import List, Dict, Tuple
from game_models import GameState, HarvestBlock, PermitStatus, CertificationType, Certification
from utils import ask, print_subsection, format_currency, format_volume
from permits import selective_permit_submission
from certification import certification_opportunities
from liaison import liaison_management


class CEOProfile:
    def __init__(self, name: str, background: str, annual_fee: int, profit_cut: float, 
                 decision_making: float, risk_tolerance: str, strengths: List[str], weaknesses: List[str]):
        self.name = name
        self.background = background
        self.annual_fee = annual_fee
        self.profit_cut = profit_cut  # Percentage of profits they take
        self.decision_making = decision_making  # Percentage of decisions they make
        self.risk_tolerance = risk_tolerance  # "conservative", "moderate", "aggressive"
        self.strengths = strengths
        self.weaknesses = weaknesses
        self.years_employed = 0
        self.performance_rating = 0.5  # Starts neutral, improves/degrades based on results


def ceo_management(state: GameState):
    """Manage CEO hiring and performance."""
    current_ceo = getattr(state, 'ceo', None)
    
    if current_ceo is None:
        print("👔 No CEO currently employed - you make all decisions personally")
        _offer_ceo_hiring(state)
    else:
        print(f"👔 Current CEO: {current_ceo.name}")
        print(f"   📊 Performance rating: {current_ceo.performance_rating:.2f}/1.0")
        print(f"   ⏱️  Years employed: {current_ceo.years_employed}")
        _ceo_management_options(state, current_ceo)


def _offer_ceo_hiring(state: GameState):
    """Present CEO hiring options."""
    print_subsection("CEO HIRING OPPORTUNITIES")
    print("Hire a CEO to handle 60% of operational decisions while you focus on strategy")
    print("⚠️  CEOs take 30% of profits plus annual fees but bring expertise")
    
    ceo_candidates = [
        CEOProfile(
            name="Margaret Chen",
            background="Former BC Ministry of Forests executive",
            annual_fee=200000,
            profit_cut=0.30,
            decision_making=0.60,
            risk_tolerance="conservative",
            strengths=["Regulatory expertise", "Government relations", "Risk management"],
            weaknesses=["Slow to innovate", "Avoids profitable risks"]
        ),
        CEOProfile(
            name="James Running Bear",
            background="Indigenous forestry leader with 25 years experience",
            annual_fee=180000,
            profit_cut=0.30,
            decision_making=0.60,
            risk_tolerance="moderate",
            strengths=["First Nations relations", "Sustainable practices", "Community engagement"],
            weaknesses=["Limited international markets", "Technology adoption"]
        ),
        CEOProfile(
            name="Alexandra Kowalski",
            background="Former Wall Street timber investment analyst",
            annual_fee=250000,
            profit_cut=0.30,
            decision_making=0.60,
            risk_tolerance="aggressive",
            strengths=["Financial optimization", "Market analysis", "Profit maximization"],
            weaknesses=["Regulatory compliance", "Environmental concerns", "Public relations"]
        ),
        CEOProfile(
            name="Dr. David Sustainability",
            background="Environmental science PhD, certification specialist",
            annual_fee=170000,
            profit_cut=0.30,
            decision_making=0.60,
            risk_tolerance="conservative",
            strengths=["Certification expertise", "Environmental compliance", "Scientific research"],
            weaknesses=["Business acumen", "Aggressive timelines", "Cost control"]
        )
    ]
    
    print("\nAvailable CEO candidates:")
    for i, ceo in enumerate(ceo_candidates):
        print(f"\n{i+1}. {ceo.name} - {format_currency(ceo.annual_fee)}/year + 30% profit share")
        print(f"   📋 Background: {ceo.background}")
        print(f"   📊 Decision making: {ceo.decision_making*100:.0f}% of operational choices")
        print(f"   🎯 Risk tolerance: {ceo.risk_tolerance.title()}")
        print(f"   ✅ Strengths: {', '.join(ceo.strengths)}")
        print(f"   ⚠️  Weaknesses: {', '.join(ceo.weaknesses)}")
    
    options = [f"Hire {ceo.name}" for ceo in ceo_candidates]
    options.append("Continue without CEO (maintain full control)")
    
    choice = ask("CEO hiring decision:", options)
    
    if choice < len(ceo_candidates):
        chosen_ceo = ceo_candidates[choice]
        
        if state.budget < chosen_ceo.annual_fee:
            print(f"❌ Insufficient budget for CEO annual fee: {format_currency(chosen_ceo.annual_fee)}")
            return
        
        state.budget -= chosen_ceo.annual_fee
        state.ceo = chosen_ceo
        
        print(f"✅ {chosen_ceo.name} hired as CEO!")
        print(f"💰 Annual fee: {format_currency(chosen_ceo.annual_fee)} paid")
        print(f"📋 They will now make {chosen_ceo.decision_making*100:.0f}% of operational decisions")
        print(f"💼 You retain strategic oversight and veto power")
        
        # Immediate effects based on CEO background
        if "Government relations" in chosen_ceo.strengths:
            state.permit_bonus += 0.1
            print(f"📈 Immediate permit processing improvement from government connections")
        elif "First Nations relations" in chosen_ceo.strengths:
            for fn in state.first_nations:
                fn.relationship_level += 0.1
            print(f"🤝 Immediate First Nations relationship improvement")
        elif "Financial optimization" in chosen_ceo.strengths:
            state.revenue_per_m3 = int(state.revenue_per_m3 * 1.05)
            print(f"💰 Immediate 5% revenue improvement from market optimization")
        
    else:
        print("👔 Continuing with personal management of all decisions")


def _ceo_management_options(state: GameState, ceo: CEOProfile):
    """Handle ongoing CEO management."""
    options = [
        "Review CEO performance and decisions",
        "Give CEO specific strategic direction",
        "Replace CEO with different candidate",
        "Fire CEO and resume personal control",
        "Continue with current CEO arrangement"
    ]
    
    choice = ask("CEO management action:", options)
    
    if choice == 0:  # Review performance
        _review_ceo_performance(state, ceo)
    elif choice == 1:  # Strategic direction
        _give_ceo_direction(state, ceo)
    elif choice == 2:  # Replace CEO
        _replace_ceo(state, ceo)
    elif choice == 3:  # Fire CEO
        _fire_ceo(state, ceo)
    else:  # Continue
        print(f"📋 Continuing with {ceo.name} as CEO")


def _review_ceo_performance(state: GameState, ceo: CEOProfile):
    """Review CEO performance metrics."""
    print_subsection(f"CEO PERFORMANCE REVIEW - {ceo.name}")
    
    # Calculate performance metrics
    revenue_growth = state.total_revenue / max(1, ceo.years_employed * 1000000)  # Revenue per year employed
    profit_efficiency = state.consecutive_profitable_years / max(1, ceo.years_employed)
    
    print(f"📊 Performance Metrics:")
    print(f"   Years employed: {ceo.years_employed}")
    print(f"   Performance rating: {ceo.performance_rating:.2f}/1.0")
    print(f"   Revenue efficiency: {revenue_growth:.2f}M/year")
    print(f"   Profit consistency: {profit_efficiency:.2f}")
    
    print(f"\n💼 Recent CEO Decisions:")
    _show_recent_ceo_decisions(state, ceo)
    
    print(f"\n💰 Financial Impact:")
    total_ceo_costs = ceo.annual_fee * ceo.years_employed
    total_profit_share = state.total_revenue * ceo.profit_cut if state.total_revenue > 0 else 0
    total_ceo_compensation = total_ceo_costs + total_profit_share
    
    print(f"   Total CEO compensation: {format_currency(total_ceo_compensation)}")
    print(f"   Annual fees paid: {format_currency(total_ceo_costs)}")
    print(f"   Profit sharing paid: {format_currency(total_profit_share)}")
    
    if state.total_revenue > total_ceo_compensation:
        net_benefit = state.total_revenue - total_ceo_compensation
        print(f"   ✅ Net benefit from CEO: {format_currency(net_benefit)}")
    else:
        net_cost = total_ceo_compensation - state.total_revenue
        print(f"   ❌ Net cost of CEO: {format_currency(net_cost)}")


def _give_ceo_direction(state: GameState, ceo: CEOProfile):
    """Give strategic direction to CEO."""
    print_subsection(f"STRATEGIC DIRECTION FOR {ceo.name}")
    
    directions = [
        "Focus on regulatory compliance and risk reduction",
        "Prioritize First Nations relationships and consultation",
        "Maximize short-term profits and harvest volumes",
        "Invest heavily in certifications and sustainability",
        "Balance all factors with moderate approach"
    ]
    
    choice = ask("Strategic direction for CEO:", directions)
    
    # Adjust CEO behavior based on direction
    if choice == 0:  # Compliance focus
        ceo.risk_tolerance = "conservative"
        print(f"📋 {ceo.name} will focus on regulatory compliance")
        state.permit_bonus += 0.05
        
    elif choice == 1:  # First Nations focus
        print(f"🤝 {ceo.name} will prioritize Indigenous relationships")
        for fn in state.first_nations:
            fn.relationship_level += 0.05
            
    elif choice == 2:  # Profit focus
        ceo.risk_tolerance = "aggressive"
        print(f"💰 {ceo.name} will maximize short-term profits")
        state.operating_cost_per_m3 = int(state.operating_cost_per_m3 * 0.95)
        
    elif choice == 3:  # Sustainability focus
        print(f"🌱 {ceo.name} will invest in sustainability")
        state.biodiversity_score += 0.05
        
    else:  # Balanced approach
        ceo.risk_tolerance = "moderate"
        print(f"⚖️  {ceo.name} will take a balanced approach")


def _replace_ceo(state: GameState, current_ceo: CEOProfile):
    """Replace current CEO with a different candidate."""
    print_subsection(f"REPLACING CEO - {current_ceo.name}")
    
    # Calculate replacement costs
    severance = current_ceo.annual_fee * 0.25  # 3 months severance for replacement
    headhunter_fee = 50000  # Executive search fee
    total_replacement_cost = severance + headhunter_fee
    
    print(f"💸 Replacement costs:")
    print(f"   Severance for {current_ceo.name}: {format_currency(severance)}")
    print(f"   Executive search fee: {format_currency(headhunter_fee)}")
    print(f"   Total replacement cost: {format_currency(total_replacement_cost)}")
    
    if state.budget < total_replacement_cost:
        print(f"❌ Insufficient budget for CEO replacement!")
        return
    
    # Remove current CEO bonuses
    if "Government relations" in current_ceo.strengths:
        state.permit_bonus -= 0.1
    elif "First Nations relations" in current_ceo.strengths:
        for fn in state.first_nations:
            fn.relationship_level -= 0.1
    elif "Financial optimization" in current_ceo.strengths:
        state.revenue_per_m3 = int(state.revenue_per_m3 / 1.05)
    
    # Pay replacement costs
    state.budget -= total_replacement_cost
    
    # Offer new CEO candidates
    print(f"\n📋 {current_ceo.name} has been replaced. Select new CEO:")
    state.ceo = None  # Temporarily remove current CEO
    _offer_ceo_hiring(state)


def _fire_ceo(state: GameState, ceo: CEOProfile):
    """Fire the current CEO."""
    print_subsection(f"TERMINATING CEO CONTRACT - {ceo.name}")
    
    # Calculate severance
    severance = ceo.annual_fee * 0.5  # 6 months severance
    
    print(f"💸 Severance payment: {format_currency(severance)}")
    print(f"📋 Resuming personal control of all decisions")
    
    if state.budget >= severance:
        state.budget -= severance
        state.ceo = None
        print(f"✅ CEO contract terminated")
        print(f"👔 You now make 100% of decisions personally")
        
        # Remove CEO bonuses
        if "Government relations" in ceo.strengths:
            state.permit_bonus -= 0.1
        elif "First Nations relations" in ceo.strengths:
            for fn in state.first_nations:
                fn.relationship_level -= 0.1
        elif "Financial optimization" in ceo.strengths:
            state.revenue_per_m3 = int(state.revenue_per_m3 / 1.05)
        
    else:
        print(f"❌ Insufficient budget for severance payment!")


def ceo_automated_decisions(state: GameState) -> List[str]:
    """CEO makes automated decisions based on their profile - now with direct costs."""
    ceo = getattr(state, 'ceo', None)
    if ceo is None:
        return []
    
    decisions_made = []
    
    # CEO automatically makes decisions (no approval needed) but charges for each action
    if random.random() < ceo.decision_making:  # 60% chance CEO makes decisions
        
        # Calculate decision costs (CEOs charge for each action)
        decision_cost = ceo.annual_fee // 8  # 1/8 of annual fee per decision set
        
        # Permit application decisions
        pending_permits = len([b for b in state.harvest_blocks if b.permit_status == PermitStatus.PENDING])
        if pending_permits > 0 and state.budget >= decision_cost:
            state.budget -= decision_cost
            if "Regulatory expertise" in ceo.strengths or ceo.risk_tolerance == "conservative":
                decisions_made.append(f"CEO {ceo.name} submitted conservative permit applications (Cost: {format_currency(decision_cost)})")
            elif ceo.risk_tolerance == "aggressive":
                decisions_made.append(f"CEO {ceo.name} submitted aggressive permit strategy (Cost: {format_currency(decision_cost)})")
        
        # First Nations decisions
        poor_relations = [fn for fn in state.first_nations if fn.relationship_level < 0.5]
        if poor_relations and "First Nations relations" in ceo.strengths and state.budget >= decision_cost:
            state.budget -= decision_cost
            for fn in poor_relations:
                fn.relationship_level = min(1.0, fn.relationship_level + 0.15)
            decisions_made.append(f"CEO {ceo.name} invested in First Nations relationship building (Cost: {format_currency(decision_cost)})")
        
        # Certification decisions
        if (not state.get_active_certifications() and "Certification expertise" in ceo.strengths 
            and state.budget >= decision_cost + 100000):
            state.budget -= decision_cost
            decisions_made.append(f"CEO {ceo.name} pursuing forest certification (Cost: {format_currency(decision_cost)})")
        
        # Financial optimization
        if ("Financial optimization" in ceo.strengths and ceo.risk_tolerance == "aggressive" 
            and state.budget >= decision_cost):
            if random.random() < 0.4:  # 40% chance of cost cutting
                state.budget -= decision_cost
                cost_reduction = random.randint(2, 5)
                state.operating_cost_per_m3 = max(30, state.operating_cost_per_m3 - cost_reduction)
                decisions_made.append(f"CEO {ceo.name} cut operating costs by ${cost_reduction}/m³ (Cost: {format_currency(decision_cost)})")
        
        # Market expansion decisions
        if ("Financial optimization" in ceo.strengths and state.revenue_per_m3 < 95 
            and state.budget >= decision_cost * 2):  # More expensive market decisions
            if random.random() < 0.3:
                state.budget -= decision_cost * 2
                revenue_increase = random.randint(3, 8)
                state.revenue_per_m3 += revenue_increase
                decisions_made.append(f"CEO {ceo.name} secured premium market contracts (+${revenue_increase}/m³) (Cost: {format_currency(decision_cost * 2)})")
        
        # Safety and compliance decisions
        if "Regulatory expertise" in ceo.strengths and state.budget >= decision_cost:
            if hasattr(state, 'safety_violations') and state.safety_violations > 0:
                state.budget -= decision_cost
                state.safety_violations = max(0, state.safety_violations - 1)
                state.reputation = min(1.0, state.reputation + 0.05)
                decisions_made.append(f"CEO {ceo.name} implemented safety compliance improvements (Cost: {format_currency(decision_cost)})")
        
        # Environmental initiatives
        if "Certification expertise" in ceo.strengths and state.biodiversity_score < 0.7 and state.budget >= decision_cost:
            if random.random() < 0.3:
                state.budget -= decision_cost
                state.biodiversity_score = min(1.0, state.biodiversity_score + 0.1)
                decisions_made.append(f"CEO {ceo.name} launched environmental initiative (Cost: {format_currency(decision_cost)})")
        
        # Add warning if CEO wanted to act but couldn't due to budget
        if not decisions_made and pending_permits > 0:
            decisions_made.append(f"CEO {ceo.name} unable to act due to insufficient budget (needs {format_currency(decision_cost)} per decision)")
    
    return decisions_made


def _show_recent_ceo_decisions(state: GameState, ceo: CEOProfile):
    """Show recent decisions made by the CEO."""
    # This would track actual decisions in a real implementation
    sample_decisions = [
        f"Applied for permits on 3 harvest blocks (approved: 2, denied: 1)",
        f"Invested ${format_currency(25000)} in First Nations consultation",
        f"Negotiated 3% cost reduction with contractors",
        f"Delayed high-risk harvest to avoid regulatory issues"
    ]
    
    for decision in sample_decisions:
        print(f"   📋 {decision}")


def pay_ceo_annual_costs(state: GameState):
    """Handle annual CEO payments and profit sharing."""
    ceo = getattr(state, 'ceo', None)
    if ceo is None:
        return
    
    # Annual fee
    if state.budget >= ceo.annual_fee:
        state.budget -= ceo.annual_fee
        print(f"💰 CEO annual fee paid: {format_currency(ceo.annual_fee)} to {ceo.name}")
    else:
        print(f"❌ Cannot afford CEO annual fee! {ceo.name} threatens to quit")
        if random.random() < 0.5:  # 50% chance CEO quits
            print(f"👔 {ceo.name} resigns due to non-payment")
            state.ceo = None
            return
    
    # Profit sharing (taken from actual profits made)
    if hasattr(state, 'quarterly_profit') and state.quarterly_profit > 0:
        profit_share = state.quarterly_profit * ceo.profit_cut
        state.budget -= profit_share
        print(f"💼 CEO profit sharing: {format_currency(profit_share)} ({ceo.profit_cut*100:.0f}% of quarterly profit)")
    
    ceo.years_employed += 0.25  # Quarterly increment
    
    # Update performance rating based on company performance
    if state.consecutive_profitable_years > 0:
        ceo.performance_rating = min(1.0, ceo.performance_rating + 0.05)
    else:
        ceo.performance_rating = max(0.0, ceo.performance_rating - 0.1)


def ceo_quarterly_report(state: GameState):
    """CEO provides quarterly performance report."""
    ceo = getattr(state, 'ceo', None)
    if ceo is None:
        return
    
    print_subsection(f"CEO QUARTERLY REPORT - {ceo.name}")
    
    # CEO analyzes company performance
    if state.reputation > 0.7:
        print(f"👔 '{ceo.name}: Company reputation is strong - good for long-term stability'")
    elif state.reputation < 0.4:
        print(f"👔 '{ceo.name}: Reputation concerns need immediate attention'")
    
    if state.budget < 500000:
        print(f"👔 '{ceo.name}: Cash flow is concerning - consider cost reductions'")
    elif state.budget > 2000000:
        print(f"👔 '{ceo.name}: Strong financial position - opportunity for expansion'")
    
    # CEO makes strategic recommendations
    recommendations = _generate_ceo_recommendations(state, ceo)
    if recommendations:
        print(f"📋 Strategic recommendations from {ceo.name}:")
        for rec in recommendations:
            print(f"   • {rec}")


def _generate_ceo_recommendations(state: GameState, ceo: CEOProfile) -> List[str]:
    """Generate strategic recommendations based on CEO expertise."""
    recommendations = []
    
    if "Government relations" in ceo.strengths and state.permit_bonus < 0.2:
        recommendations.append("Invest in government relations to improve permit processing")
    
    if "First Nations relations" in ceo.strengths:
        poor_relations = [fn for fn in state.first_nations if fn.relationship_level < 0.6]
        if poor_relations:
            recommendations.append(f"Priority consultation needed with {poor_relations[0].name}")
    
    if "Financial optimization" in ceo.strengths and state.operating_cost_per_m3 > 40:
        recommendations.append("Operational efficiency improvements could reduce costs")
    
    if "Certification expertise" in ceo.strengths and not state.get_active_certifications():
        recommendations.append("Forest certification would unlock premium markets")
    
    return recommendations