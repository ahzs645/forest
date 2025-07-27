"""
Workplace Safety Events System
Handles workplace fatalities, injuries, and WorkSafeBC investigations
"""

import random
from typing import List, Dict
from game_models import GameState
from utils import ask, print_subsection, format_currency


class SafetyIncident:
    def __init__(self, incident_type: str, description: str, cause: str, 
                 immediate_costs: int, wsbc_fine: int, reputation_penalty: float,
                 operational_impact: Dict, legal_consequences: List[str]):
        self.incident_type = incident_type
        self.description = description
        self.cause = cause
        self.immediate_costs = immediate_costs
        self.wsbc_fine = wsbc_fine
        self.reputation_penalty = reputation_penalty
        self.operational_impact = operational_impact
        self.legal_consequences = legal_consequences


def workplace_safety_incidents(state: GameState) -> bool:
    """Generate workplace safety incidents including fatalities."""
    # Higher chance if cutting costs or poor reputation
    base_chance = 0.08  # 8% base chance per quarter
    
    # Risk factors increase chance
    risk_multiplier = 1.0
    if state.operating_cost_per_m3 < 35:  # Cutting safety costs
        risk_multiplier += 0.5
    if state.reputation < 0.4:  # Poor reputation often means poor safety culture
        risk_multiplier += 0.3
    if hasattr(state, 'safety_violations') and state.safety_violations > 0:
        risk_multiplier += 0.4
    
    if random.random() > base_chance * risk_multiplier:
        return False
    
    print_subsection("🚨 WORKPLACE SAFETY INCIDENT")
    
    # Define various safety incidents
    incidents = [
        SafetyIncident(
            incident_type="FATALITY - Falling Tree",
            description="A 28-year-old faller was struck and killed by a widow-maker during harvest operations",
            cause="Inadequate hazard assessment and communication failures",
            immediate_costs=150000,  # Family support, investigation costs
            wsbc_fine=500000,
            reputation_penalty=0.4,
            operational_impact={"operations_suspended": True, "investigation_days": 45},
            legal_consequences=["Criminal negligence investigation", "Coroner's inquest", "Media scrutiny"]
        ),
        
        SafetyIncident(
            incident_type="FATALITY - Equipment Accident",
            description="Heavy equipment operator crushed when loader rolled over on steep terrain",
            cause="Equipment operated beyond safe slope limits, no rollover protection",
            immediate_costs=200000,
            wsbc_fine=750000,
            reputation_penalty=0.5,
            operational_impact={"operations_suspended": True, "investigation_days": 60, "equipment_seized": True},
            legal_consequences=["Crown counsel review", "Equipment manufacturer lawsuit", "Family wrongful death suit"]
        ),
        
        SafetyIncident(
            incident_type="FATALITY - Transportation Accident",
            description="Logging truck driver killed in highway collision with loaded trailer",
            cause="Driver fatigue and inadequate vehicle maintenance",
            immediate_costs=300000,
            wsbc_fine=400000,
            reputation_penalty=0.3,
            operational_impact={"transportation_suspended": True, "investigation_days": 30},
            legal_consequences=["Criminal negligence charges", "Commercial vehicle ban", "Public inquiry"]
        ),
        
        SafetyIncident(
            incident_type="SERIOUS INJURY - Chainsaw Accident",
            description="Worker suffered severe leg lacerations requiring emergency helicopter evacuation",
            cause="Improper chainsaw safety procedures and inadequate first aid response",
            immediate_costs=75000,
            wsbc_fine=150000,
            reputation_penalty=0.2,
            operational_impact={"safety_review": True, "investigation_days": 15},
            legal_consequences=["WorkSafeBC prosecution", "Safety program review"]
        ),
        
        SafetyIncident(
            incident_type="MULTIPLE INJURIES - Helicopter Crash",
            description="Helicopter carrying 4 workers crashed during crew transport, 2 critical injuries",
            cause="Pilot error in poor weather conditions, inadequate weather protocols",
            immediate_costs=500000,
            wsbc_fine=800000,
            reputation_penalty=0.6,
            operational_impact={"operations_suspended": True, "investigation_days": 90, "aviation_ban": True},
            legal_consequences=["Transport Canada investigation", "Criminal charges", "Aviation lawsuit"]
        ),
        
        SafetyIncident(
            incident_type="CHEMICAL EXPOSURE Incident",
            description="3 workers hospitalized after exposure to herbicide spray drift",
            cause="Inadequate wind monitoring and personal protective equipment failures",
            immediate_costs=125000,
            wsbc_fine=250000,
            reputation_penalty=0.25,
            operational_impact={"chemical_operations_suspended": True, "investigation_days": 25},
            legal_consequences=["Health Canada investigation", "Environmental prosecution", "Worker compensation claims"]
        )
    ]
    
    # Select incident based on current operations and risk factors
    if state.operating_cost_per_m3 < 35:  # Higher chance of serious incidents when cutting costs
        incident = random.choice(incidents[:3])  # Fatalities more likely
    else:
        incident = random.choice(incidents)
    
    print(f"💀 INCIDENT TYPE: {incident.incident_type}")
    print(f"📰 {incident.description}")
    print(f"🔍 Preliminary Cause: {incident.cause}")
    print(f"")
    print(f"⚠️  IMMEDIATE CONSEQUENCES:")
    print(f"   💸 Emergency costs: {format_currency(incident.immediate_costs)}")
    print(f"   🏛️  WorkSafeBC fine: {format_currency(incident.wsbc_fine)}")
    print(f"   📉 Reputation damage: -{incident.reputation_penalty:.2f}")
    
    # Apply immediate impacts
    state.budget -= incident.immediate_costs
    state.reputation = max(0.0, state.reputation - incident.reputation_penalty)
    
    # Operational impacts
    operations_suspended_days = 0
    if incident.operational_impact.get("operations_suspended"):
        operations_suspended_days = incident.operational_impact.get("investigation_days", 30)
        print(f"   ⏸️  All operations suspended for {operations_suspended_days} days")
        
        # Calculate lost revenue during suspension
        daily_revenue = (state.revenue_per_m3 * state.annual_allowable_cut) / 365
        lost_revenue = daily_revenue * operations_suspended_days
        state.budget -= int(lost_revenue)
        print(f"   💸 Lost revenue during suspension: {format_currency(int(lost_revenue))}")
    
    # WorkSafeBC Investigation Process
    print(f"")
    print(f"🏛️  WORKSAFEBC INVESTIGATION INITIATED")
    print(f"📋 Legal consequences:")
    for consequence in incident.legal_consequences:
        print(f"   • {consequence}")
    
    # Response options
    print(f"")
    print(f"🤔 How do you respond to this crisis?")
    
    response_options = [
        {
            "description": "Full cooperation with investigation, implement all safety recommendations",
            "cost": 200000,
            "fine_reduction": 0.3,
            "reputation_recovery": 0.15,
            "description_detail": "Hire external safety consultants, implement gold-standard protocols"
        },
        {
            "description": "Standard compliance response, meet minimum legal requirements",
            "cost": 75000,
            "fine_reduction": 0.1,
            "reputation_recovery": 0.05,
            "description_detail": "Basic legal compliance, internal safety review"
        },
        {
            "description": "Minimize response, challenge WorkSafeBC findings in court",
            "cost": 150000,  # Legal fees
            "fine_reduction": -0.2,  # Penalty for non-cooperation
            "reputation_recovery": -0.1,
            "description_detail": "Aggressive legal defense, minimal safety improvements"
        },
        {
            "description": "🔴 Attempt to bribe WorkSafeBC inspectors to reduce penalties",
            "cost": 100000,
            "fine_reduction": 0.5,  # If successful
            "reputation_recovery": 0.0,
            "description_detail": "ILLEGAL: Attempt to corrupt government officials",
            "illegal": True,
            "detection_risk": 0.6
        }
    ]
    
    for i, option in enumerate(response_options):
        cost_text = f" (Cost: {format_currency(option['cost'])})"
        illegal_text = " ⚠️ ILLEGAL ACTIVITY" if option.get('illegal') else ""
        print(f"{i+1}. {option['description']}{cost_text}{illegal_text}")
        print(f"   📝 {option['description_detail']}")
    
    choice = ask("Choose your response:", [opt['description'] for opt in response_options])
    chosen_response = response_options[choice]
    
    print(f"")
    print(f"🎯 RESPONSE: {chosen_response['description']}")
    
    # Handle illegal bribery option
    if chosen_response.get('illegal'):
        return _handle_worksafebc_bribery(state, incident, chosen_response)
    
    # Handle legal responses
    if state.budget >= chosen_response['cost']:
        state.budget -= chosen_response['cost']
        print(f"💰 Response cost: {format_currency(chosen_response['cost'])} paid")
        
        # Calculate final WorkSafeBC fine
        final_fine = int(incident.wsbc_fine * (1 - chosen_response['fine_reduction']))
        state.budget -= final_fine
        print(f"🏛️  Final WorkSafeBC fine: {format_currency(final_fine)}")
        
        # Apply reputation effects
        if chosen_response['reputation_recovery'] > 0:
            state.reputation = min(1.0, state.reputation + chosen_response['reputation_recovery'])
            print(f"📈 Reputation recovery: +{chosen_response['reputation_recovery']:.2f}")
        elif chosen_response['reputation_recovery'] < 0:
            state.reputation = max(0.0, state.reputation + chosen_response['reputation_recovery'])
            print(f"📉 Additional reputation damage: {chosen_response['reputation_recovery']:.2f}")
        
        # Long-term consequences
        if choice == 0:  # Full cooperation
            print(f"✅ WorkSafeBC commends company's proactive response")
            print(f"📈 Future inspection frequency reduced")
            if not hasattr(state, 'safety_violations'):
                state.safety_violations = 0
            state.safety_violations = max(0, state.safety_violations - 1)
            
        elif choice == 2:  # Challenge findings
            print(f"⚖️  Legal battle with WorkSafeBC ongoing")
            print(f"📰 Media portrays company as fighting safety regulations")
            print(f"🔍 Future inspections will be more frequent and thorough")
            if not hasattr(state, 'safety_violations'):
                state.safety_violations = 0
            state.safety_violations += 1
        
    else:
        print(f"❌ INSUFFICIENT BUDGET: Cannot afford response costs!")
        print(f"🚨 Bankruptcy proceedings may be initiated")
        print(f"💸 Full WorkSafeBC fine imposed: {format_currency(incident.wsbc_fine)}")
        state.budget -= incident.wsbc_fine
    
    # Industry-wide impact
    print(f"")
    print(f"📊 INDUSTRY IMPACT:")
    print(f"🔍 Increased regulatory scrutiny across BC forestry sector")
    print(f"📰 Media attention on forestry safety practices")
    print(f"⚖️  Potential for new safety regulations")
    
    # Track safety violations for future incidents
    if not hasattr(state, 'safety_violations'):
        state.safety_violations = 0
    state.safety_violations += 1
    
    return True


def _handle_worksafebc_bribery(state: GameState, incident: SafetyIncident, response: Dict) -> bool:
    """Handle attempted bribery of WorkSafeBC officials."""
    print(f"")
    print_subsection("🔴 ATTEMPTING GOVERNMENT CORRUPTION")
    print(f"⚠️  WARNING: Bribing government officials is a serious criminal offense!")
    print(f"💀 Potential consequences: Criminal charges, asset forfeiture, imprisonment")
    
    confirm = ask("Are you absolutely certain you want to proceed?", ["Yes, proceed with bribery", "No, choose legal response"])
    
    if confirm == 1:
        print(f"📋 Returning to legal response options...")
        return False
    
    # Attempt bribery
    print(f"💰 Attempting to bribe WorkSafeBC inspectors with {format_currency(response['cost'])}")
    
    if state.budget < response['cost']:
        print(f"❌ Insufficient funds for bribery attempt!")
        return False
    
    state.budget -= response['cost']
    
    # Roll for detection
    if random.random() < response['detection_risk']:
        print(f"🚨 BRIBERY DETECTED!")
        print(f"📞 WorkSafeBC officials report bribery attempt to RCMP")
        print(f"⚖️  Criminal charges laid for corruption of government officials")
        
        # Massive penalties for detected bribery
        criminal_fine = 1500000
        state.budget -= criminal_fine
        state.reputation = max(0.0, state.reputation - 0.6)
        
        print(f"💸 Criminal fine: {format_currency(criminal_fine)}")
        print(f"📉 Massive reputation damage: -0.6")
        print(f"🏛️  Original WorkSafeBC fine DOUBLED as penalty")
        
        doubled_fine = incident.wsbc_fine * 2
        state.budget -= doubled_fine
        print(f"💸 Enhanced WorkSafeBC fine: {format_currency(doubled_fine)}")
        
        # Industry blacklisting
        print(f"🚫 Company blacklisted from government contracts")
        print(f"📰 International media coverage of corruption scandal")
        
        return True
    else:
        print(f"🤫 Bribery successful - inspectors accept payment")
        
        # Reduced fine as promised
        reduced_fine = int(incident.wsbc_fine * (1 - response['fine_reduction']))
        state.budget -= reduced_fine
        print(f"🏛️  'Reduced' WorkSafeBC fine: {format_currency(reduced_fine)}")
        
        # But ongoing blackmail risk
        print(f"⚠️  WARNING: Corrupt officials now have leverage over company")
        print(f"💰 Expect future 'requests' for additional payments")
        
        # Set up future blackmail events
        if not hasattr(state, 'corrupt_officials'):
            state.corrupt_officials = []
        state.corrupt_officials.append('worksafebc_inspector')
        
        return True


def ongoing_safety_consequences(state: GameState):
    """Handle ongoing consequences of past safety incidents."""
    if not hasattr(state, 'safety_violations'):
        return
    
    if state.safety_violations > 0 and random.random() < 0.15:  # 15% chance quarterly
        consequences = [
            {
                "event": "🔍 Surprise WorkSafeBC inspection finds additional violations",
                "cost": random.randint(25000, 100000),
                "reputation": -0.05
            },
            {
                "event": "📰 Media investigation exposes company safety culture problems",
                "cost": random.randint(50000, 150000),
                "reputation": -0.1
            },
            {
                "event": "⚖️  Family of deceased worker files wrongful death lawsuit",
                "cost": random.randint(200000, 500000),
                "reputation": -0.15
            },
            {
                "event": "🏛️  WorkSafeBC orders immediate safety training for all staff",
                "cost": random.randint(75000, 200000),
                "reputation": 0.05
            }
        ]
        
        consequence = random.choice(consequences)
        
        print_subsection("🚨 ONGOING SAFETY CONSEQUENCES")
        print(consequence["event"])
        print(f"💸 Additional costs: {format_currency(consequence['cost'])}")
        
        state.budget -= consequence['cost']
        state.reputation = max(0.0, min(1.0, state.reputation + consequence['reputation']))
        
        if consequence['reputation'] > 0:
            print(f"📈 Reputation improvement: +{consequence['reputation']:.2f}")
        else:
            print(f"📉 Reputation damage: {consequence['reputation']:.2f}")


def workplace_safety_audit(state: GameState):
    """Voluntary safety audit to reduce future incident risk."""
    print_subsection("VOLUNTARY SAFETY AUDIT")
    print("🔍 Conduct comprehensive workplace safety audit")
    print("💡 Proactive safety investment reduces future incident risk")
    
    audit_cost = 100000
    
    if state.budget < audit_cost:
        print(f"❌ Insufficient budget for safety audit: {format_currency(audit_cost)}")
        return
    
    choice = ask(f"Conduct safety audit for {format_currency(audit_cost)}?", ["Yes", "No"])
    
    if choice == 0:
        state.budget -= audit_cost
        print(f"✅ Comprehensive safety audit completed")
        print(f"📈 Future incident risk reduced by 40%")
        print(f"📈 Reputation improvement: +0.1")
        
        state.reputation = min(1.0, state.reputation + 0.1)
        
        # Reduce safety violations
        if hasattr(state, 'safety_violations'):
            state.safety_violations = max(0, state.safety_violations - 1)
        
        # Set safety improvement flag
        state.safety_audit_completed = True
    else:
        print(f"📋 Safety audit declined")