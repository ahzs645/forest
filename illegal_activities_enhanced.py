"""
Enhanced Multi-Layer Illegal Activities System
Complex illegal operations with multiple stages, confirmation screens, and bribery layers
"""

import random
from typing import List, Dict, Tuple
from game_models import GameState, FirstNation, HarvestBlock, PermitStatus
from utils import ask, print_subsection, format_currency


class IllegalOperation:
    def __init__(self, name: str, description: str, story: str, 
                 stages: List[Dict], total_profit: int, base_risk: float, 
                 complexity: str, prerequisites: List[str] = None):
        self.name = name
        self.description = description
        self.story = story
        self.stages = stages  # List of operation stages
        self.total_profit = total_profit
        self.base_risk = base_risk
        self.complexity = complexity
        self.prerequisites = prerequisites or []
        self.current_stage = 0
        self.accumulated_risk = 0.0
        self.accumulated_profit = 0
        self.completed = False


class SimpleIllegalAct:
    def __init__(self, name: str, description: str, cost_savings: int, detection_risk: float, 
                 reputation_penalty: float, fine_amount: int, story: str = ""):
        self.name = name
        self.description = description
        self.cost_savings = cost_savings
        self.detection_risk = detection_risk
        self.reputation_penalty = reputation_penalty
        self.fine_amount = fine_amount
        self.story = story


def enhanced_illegal_opportunities(state: GameState) -> bool:
    """Present mix of simple and complex illegal opportunities."""
    if random.random() > 0.6:  # 60% chance of illegal opportunities
        return False
    
    print_subsection("🔴 ILLEGAL BUSINESS OPPORTUNITIES")
    print("💀 Choose between simple quick crimes or complex multi-stage operations")
    print("⚠️  Simple operations: One-time risk/reward")
    print("🎯 Complex operations: Multi-stage with escalating profits and risks")
    
    # Simple illegal operations (original style)
    simple_operations = [
        SimpleIllegalAct(
            name="Harvest Buffer Zone Violation",
            description="Cut trees within 30m of streams to maximize volume",
            cost_savings=180000,
            detection_risk=0.4,
            reputation_penalty=0.2,
            fine_amount=450000,
            story="Your crew supervisor suggests 'adjusting' the buffer zone boundaries. Those extra trees near the creek are worth $180K, but violating riparian buffers is a serious offense."
        ),
        
        SimpleIllegalAct(
            name="Exceed Cut Block Boundaries",
            description="Harvest additional trees beyond approved cut block limits",
            cost_savings=220000,
            detection_risk=0.3,
            reputation_penalty=0.15,
            fine_amount=550000,
            story="GPS shows your crew is approaching the cut block boundary, but there's premium timber just 50m beyond. Extending the harvest would add $220K profit."
        ),
        
        SimpleIllegalAct(
            name="Underreport Harvest Volumes",
            description="Scale logs as smaller than actual to reduce stumpage fees",
            cost_savings=320000,
            detection_risk=0.2,
            reputation_penalty=0.1,
            fine_amount=800000,
            story="The scaling supervisor hints that reported volumes could be 'conservative'. Underreporting 20% of harvest volume saves massive stumpage fees."
        ),
        
        SimpleIllegalAct(
            name="Bypass Archaeological Assessment",
            description="Harvest area without waiting for heritage clearance",
            cost_savings=150000,
            detection_risk=0.5,
            reputation_penalty=0.4,
            fine_amount=600000,
            story="Archaeological assessment has been pending for 6 months. Your crew leader suggests just proceeding - 'what they don't know won't hurt them'."
        ),
        
        SimpleIllegalAct(
            name="Dump Equipment Fluids",
            description="Illegally dispose of hydraulic fluid and oil in forest",
            cost_savings=85000,
            detection_risk=0.3,
            reputation_penalty=0.3,
            fine_amount=400000,
            story="Proper disposal of equipment fluids costs $85K. A mechanic offers to 'handle disposal' by dumping everything in a remote clearcut."
        ),
        
        SimpleIllegalAct(
            name="Forge Safety Training Records",
            description="Create fake safety certification documents for workers",
            cost_savings=95000,
            detection_risk=0.4,
            reputation_penalty=0.25,
            fine_amount=350000,
            story="Safety training costs are eating profits. A consultant offers to provide 'complete' safety records for all workers without actual training."
        ),
        
        SimpleIllegalAct(
            name="Bribe Local Permit Officer",
            description="Pay regional official to fast-track permit applications",
            cost_savings=200000,
            detection_risk=0.3,
            reputation_penalty=0.2,
            fine_amount=750000,
            story="The local permit officer hints that $25K could ensure your applications get priority processing while competitors wait months."
        ),
        
        # REALISTIC FORESTRY OPPORTUNITIES
        SimpleIllegalAct(
            name="High-Grade Only the Best Trees",
            description="Selectively harvest only premium logs, leaving slash and small trees",
            cost_savings=280000,
            detection_risk=0.6,
            reputation_penalty=0.3,
            fine_amount=420000,
            story="Focus only on high-value old growth and premium logs. Leave the rest as 'wildlife trees' even though your permit requires full harvest."
        ),
        
        SimpleIllegalAct(
            name="Falsify Silviculture Reports",
            description="Report tree planting and maintenance that was never done",
            cost_savings=160000,
            detection_risk=0.3,
            reputation_penalty=0.2,
            fine_amount=480000,
            story="Submit fake silviculture reports claiming you planted and tended seedlings. Government inspections are rare in remote areas."
        ),
        
        SimpleIllegalAct(
            name="Harvest During Wildlife Closure",
            description="Continue operations during seasonal wildlife protection periods",
            cost_savings=340000,
            detection_risk=0.5,
            reputation_penalty=0.4,
            fine_amount=680000,
            story="Caribou calving season shuts down operations for 2 months. Continue harvesting in 'uninhabited' areas to meet contract deadlines."
        ),
        
        SimpleIllegalAct(
            name="Modify Equipment Emission Controls",
            description="Remove emissions equipment to increase equipment power and fuel efficiency",
            cost_savings=120000,
            detection_risk=0.2,
            reputation_penalty=0.1,
            fine_amount=300000,
            story="Removing emissions controls increases equipment power 15% and saves $120K annually in fuel costs. Inspections are infrequent."
        ),
        
        SimpleIllegalAct(
            name="Use Banned Herbicides",
            description="Apply cheaper prohibited chemicals for vegetation management",
            cost_savings=190000,
            detection_risk=0.4,
            reputation_penalty=0.35,
            fine_amount=570000,
            story="Banned herbicides are 70% cheaper and more effective than approved alternatives. A supplier offers 'no questions asked' bulk chemicals."
        ),
        
        SimpleIllegalAct(
            name="Exceed Truck Weight Limits",
            description="Overload logging trucks to reduce transportation costs",
            cost_savings=240000,
            detection_risk=0.3,
            reputation_penalty=0.15,
            fine_amount=360000,
            story="Loading trucks 20% over weight limit reduces trips by 20%. Most weigh scales are predictable and avoidable."
        ),
        
        SimpleIllegalAct(
            name="Sell Timber to Black Market",
            description="Sell premium logs to unregistered mills at higher prices",
            cost_savings=380000,
            detection_risk=0.4,
            reputation_penalty=0.25,
            fine_amount=760000,
            story="Unregistered mills pay 30% above market rates for premium logs. No paperwork, no stumpage tracking, cash payments."
        ),
        
        SimpleIllegalAct(
            name="Fake First Nations Consultation",
            description="Forge consultation documents claiming Indigenous agreement",
            cost_savings=250000,
            detection_risk=0.6,
            reputation_penalty=0.7,
            fine_amount=1200000,
            story="Create fake meeting minutes and agreements to satisfy consultation requirements. Avoid actual negotiations that could delay operations."
        ),
        
        SimpleIllegalAct(
            name="Harvest Crown Land Without Permits",
            description="Cut valuable timber on adjacent Crown land assuming no one will notice",
            cost_savings=420000,
            detection_risk=0.5,
            reputation_penalty=0.4,
            fine_amount=1050000,
            story="Crown land boundaries are poorly marked. Extend harvest into valuable adjacent stands and claim 'boundary confusion' if caught."
        ),
        
        SimpleIllegalAct(
            name="Dispose of Asbestos Insulation Illegally",
            description="Bury old camp building asbestos instead of proper hazmat disposal",
            cost_savings=75000,
            detection_risk=0.2,
            reputation_penalty=0.2,
            fine_amount=225000,
            story="Demolishing old camp buildings reveals asbestos insulation. Proper disposal costs $75K. Just bury it deep in a remote clearcut."
        )
    ]
    
    # Complex multi-stage operations (enhanced)
    complex_operations = [
        
        # TAX FRAUD OPERATIONS
        IllegalOperation(
            name="The CRA Deception Network",
            description="Multi-year tax evasion scheme using shell companies and offshore accounts",
            story="A forensic accountant with mob connections offers to set up an elaborate tax evasion network. Start small with simple deductions, escalate to offshore money laundering.",
            total_profit=8500000,
            base_risk=0.2,
            complexity="multi-stage",
            stages=[
                {
                    "name": "Stage 1: Creative Deductions",
                    "description": "Inflate equipment costs and claim personal expenses as business costs",
                    "profit": 350000,
                    "risk_increase": 0.1,
                    "cost": 15000,
                    "story": "Start with 'aggressive' but seemingly legitimate tax strategies. Claim your truck, cottage, and family vacations as business expenses."
                },
                {
                    "name": "Stage 2: Shell Company Network", 
                    "description": "Create fake consulting companies to shift profits and avoid taxes",
                    "profit": 850000,
                    "risk_increase": 0.15,
                    "cost": 50000,
                    "story": "Set up 3 shell companies that 'provide consulting services' to your forestry operation. Channel profits through these companies to avoid corporate tax."
                },
                {
                    "name": "Stage 3: Offshore Banking",
                    "description": "Move profits to Cayman Islands accounts to avoid all Canadian taxes",
                    "profit": 2400000,
                    "risk_increase": 0.25,
                    "cost": 100000,
                    "story": "Open accounts in the Cayman Islands. Route all major contracts through offshore companies. CRA has limited ability to track foreign accounts."
                },
                {
                    "name": "Stage 4: International Money Laundering",
                    "description": "Partner with international criminal organizations to clean massive profits",
                    "profit": 4900000,
                    "risk_increase": 0.4,
                    "cost": 200000,
                    "story": "The accountant introduces you to Eastern European crime syndicates. They'll launder unlimited money for 15% commission. No questions asked."
                }
            ]
        ),
        
        IllegalOperation(
            name="The Timber Revenue Phantom",
            description="Systematically under-report timber sales to avoid stumpage fees and income tax",
            story="Your mill contact suggests under-reporting actual timber volumes and prices. Start with small discrepancies, escalate to completely fake invoicing systems.",
            total_profit=6200000,
            base_risk=0.3,
            complexity="multi-stage",
            stages=[
                {
                    "name": "Stage 1: Volume Underreporting",
                    "description": "Report 20% less volume than actually harvested",
                    "profit": 400000,
                    "risk_increase": 0.1,
                    "cost": 25000,
                    "story": "Simple scale manipulation. Report 80,000m³ when you actually harvested 100,000m³. Saves massive stumpage fees."
                },
                {
                    "name": "Stage 2: Price Manipulation",
                    "description": "Create fake lower-price contracts while receiving higher payments under the table",
                    "profit": 950000,
                    "risk_increase": 0.15,
                    "cost": 60000,
                    "story": "Mills officially pay you $70/m³ but secretly add $25/m³ in cash payments. Government only sees the $70 rate for tax purposes."
                },
                {
                    "name": "Stage 3: Double-Invoice System",
                    "description": "Maintain completely separate accounting systems for real vs reported sales",
                    "profit": 2100000,
                    "risk_increase": 0.3,
                    "cost": 120000,
                    "story": "Two complete sets of books. Official records show modest profits. Real records show you're making 3x more than reported to CRA."
                },
                {
                    "name": "Stage 4: Cryptocurrency Conversion",
                    "description": "Convert all unreported profits to Bitcoin to hide wealth permanently",
                    "profit": 2750000,
                    "risk_increase": 0.35,
                    "cost": 180000,
                    "story": "Convert all hidden cash to Bitcoin through untraceable exchanges. Wealth becomes virtually impossible for CRA to discover or seize."
                }
            ]
        ),
        
        # ORGANIZED CRIME OPERATIONS
        IllegalOperation(
            name="The Cocaine Highway Express",
            description="Use logging roads and equipment to transport drugs across Canada-US border",
            story="Colombian cartel contacts you through a mutual 'friend'. They need remote transportation corridors. Start with small loads, build to major trafficking operation.",
            total_profit=12000000,
            base_risk=0.4,
            complexity="multi-stage",
            stages=[
                {
                    "name": "Stage 1: Single Load Test",
                    "description": "Transport one 50kg cocaine shipment hidden in logging truck",
                    "profit": 500000,
                    "risk_increase": 0.15,
                    "cost": 25000,
                    "story": "Prove reliability with one test shipment. $500K for driving a truck from the border to Vancouver. What could go wrong?"
                },
                {
                    "name": "Stage 2: Regular Smuggling Route",
                    "description": "Establish weekly shipments using modified logging equipment",
                    "profit": 2500000,
                    "risk_increase": 0.25,
                    "cost": 100000,
                    "story": "Build hidden compartments in logging trailers. Weekly runs carrying 200kg per trip. Cartel provides protection and logistics."
                },
                {
                    "name": "Stage 3: Distribution Network",
                    "description": "Use your worker network to distribute drugs throughout BC interior",
                    "profit": 4500000,
                    "risk_increase": 0.4,
                    "cost": 200000,
                    "story": "Recruit desperate workers as dealers. Control distribution from Prince George to Kamloops. Massive profits but workers become liabilities."
                },
                {
                    "name": "Stage 4: International Cartel Partnership",
                    "description": "Become Canadian distribution hub for South American drug cartels",
                    "profit": 4500000,
                    "risk_increase": 0.6,
                    "cost": 400000,
                    "story": "Full partnership with Colombian cartels. Move 2 tonnes monthly. $50M+ annual revenue but you're now a major international criminal."
                }
            ]
        ),
        
        # ENVIRONMENTAL CRIME OPERATIONS
        IllegalOperation(
            name="The Toxic Waste Empire",
            description="Become illegal toxic waste disposal site for industries across Western Canada",
            story="Chemical companies desperately need somewhere to dump toxic waste. Your remote forestland could be worth millions as an illegal dump site.",
            total_profit=7800000,
            base_risk=0.3,
            complexity="multi-stage",
            stages=[
                {
                    "name": "Stage 1: Industrial Sludge Disposal",
                    "description": "Accept contaminated soil and industrial sludge for 'disposal'",
                    "profit": 600000,
                    "risk_increase": 0.1,
                    "cost": 50000,
                    "story": "Chemical companies pay $200/tonne to dump contaminated soil. Just bury it in remote clearcuts. Easy money."
                },
                {
                    "name": "Stage 2: Hazardous Chemical Storage",
                    "description": "Store banned pesticides and industrial chemicals in hidden bunkers",
                    "profit": 1400000,
                    "risk_increase": 0.2,
                    "cost": 150000,
                    "story": "Build underground storage for chemicals too dangerous for legal disposal. Pesticide companies pay millions to hide banned substances."
                },
                {
                    "name": "Stage 3: Radioactive Waste Facility",
                    "description": "Accept low-level radioactive waste from medical and research facilities",
                    "profit": 2800000,
                    "risk_increase": 0.35,
                    "cost": 300000,
                    "story": "Hospitals and research labs generate radioactive waste. Legal disposal costs $50,000+ per container. You'll take it for $10,000."
                },
                {
                    "name": "Stage 4: International Toxic Hub",
                    "description": "Accept toxic waste shipments from US and Asia via secret import network",
                    "profit": 3000000,
                    "risk_increase": 0.5,
                    "cost": 500000,
                    "story": "Partner with international waste brokers. Accept shipments from Asia and USA. Your land becomes North America's toxic dump."
                }
            ]
        ),
        
        # CORRUPTION AND FRAUD
        IllegalOperation(
            name="The Government Takeover",
            description="Systematically corrupt BC government officials to control forestry policy",
            story="A lobbyist offers to 'influence' key government decision-makers. Start with small bribes, escalate to controlling entire ministries.",
            total_profit=9500000,
            base_risk=0.4,
            complexity="multi-stage",
            stages=[
                {
                    "name": "Stage 1: Local Official Bribes",
                    "description": "Bribe regional forestry officials for permit advantages",
                    "profit": 800000,
                    "risk_increase": 0.15,
                    "cost": 100000,
                    "story": "Start with regional permit officers. $20K per official ensures your permits get approved first while competitors wait."
                },
                {
                    "name": "Stage 2: Ministry Infiltration",
                    "description": "Place paid agents in key positions within BC Ministry of Forests",
                    "profit": 2200000,
                    "risk_increase": 0.25,
                    "cost": 300000,
                    "story": "Fund sympathetic candidates for senior ministry positions. $300K investment gets you inside information and policy influence."
                },
                {
                    "name": "Stage 3: Legislative Control",
                    "description": "Bribe MLAs to vote for forestry-friendly legislation",
                    "profit": 3500000,
                    "risk_increase": 0.4,
                    "cost": 600000,
                    "story": "Buy votes in the BC Legislature. $50K per MLA ensures favorable forestry legislation. Control environmental and indigenous policies."
                },
                {
                    "name": "Stage 4: Premier's Office",
                    "description": "Corrupt the Premier's Chief of Staff to control provincial policy",
                    "profit": 3000000,
                    "risk_increase": 0.6,
                    "cost": 1000000,
                    "story": "The ultimate prize: the Premier's Chief of Staff. $1M secures unprecedented policy control but exposes you to federal investigation."
                }
            ]
        )
    ]
    
    # Filter complex operations based on prerequisites
    available_complex = []
    for op in complex_operations:
        if _check_prerequisites(state, op.prerequisites):
            available_complex.append(op)
    
    # Always show some simple operations
    available_simple = random.sample(simple_operations, min(4, len(simple_operations)))
    
    if not available_simple and not available_complex:
        print("🎯 No illegal opportunities available this quarter")
        return False
    
    # Present choice between simple and complex
    print(f"\n🎲 What type of illegal activity interests you?")
    
    activity_types = []
    if available_simple:
        activity_types.append("Simple one-time illegal activities (immediate profit)")
    if available_complex:
        activity_types.append("Complex multi-stage criminal operations (massive profits)")
    activity_types.append("Decline all illegal opportunities (stay legal)")
    
    type_choice = ask("Choose activity type:", activity_types)
    
    if type_choice == len(activity_types) - 1:  # Declined
        print("🎖️  Maintaining legal compliance and ethical standards")
        state.reputation += 0.05
        return False
    
    # Handle simple operations
    if type_choice == 0 and available_simple:
        return _execute_simple_illegal_activities(state, available_simple)
    
    # Handle complex operations  
    elif (type_choice == 1 if available_simple else type_choice == 0) and available_complex:
        return _present_complex_operations(state, available_complex)
    
    return False


def _execute_simple_illegal_activities(state: GameState, simple_operations: List[SimpleIllegalAct]) -> bool:
    """Execute simple one-time illegal activities."""
    print_subsection("⚡ SIMPLE ILLEGAL ACTIVITIES")
    print("💰 One-time risk/reward opportunities")
    print("⚠️  Quick profit but immediate detection risk")
    
    print(f"\nAvailable illegal activities ({len(simple_operations)} options):")
    for i, act in enumerate(simple_operations):
        risk_color = "🟢" if act.detection_risk < 0.3 else "🟡" if act.detection_risk < 0.6 else "🔴"
        profit_ratio = act.cost_savings / max(1, act.fine_amount)
        profit_color = "🟢" if profit_ratio > 0.8 else "🟡" if profit_ratio > 0.4 else "🔴"
        
        print(f"\n{i+1}. {act.name}")
        print(f"   💰 Profit: {format_currency(act.cost_savings)}")
        print(f"   {risk_color} Detection risk: {act.detection_risk*100:.0f}%")
        print(f"   💸 Potential fine: {format_currency(act.fine_amount)}")
        print(f"   {profit_color} Risk/reward ratio: {profit_ratio:.1f}")
        print(f"   📝 {act.description}")
    
    options = [act.name for act in simple_operations]
    options.append("Cancel - return to legal operations")
    
    choice = ask("Choose illegal activity:", options)
    
    if choice == len(simple_operations):  # Cancelled
        print("📋 Returning to legal business")
        return False
    
    chosen_act = simple_operations[choice]
    
    # Confirmation screen for simple activities
    print(f"\n🚨 CONFIRMATION: {chosen_act.name}")
    print(f"📖 Situation: {chosen_act.story}")
    print(f"💰 Immediate profit: {format_currency(chosen_act.cost_savings)}")
    print(f"⚠️  Detection risk: {chosen_act.detection_risk*100:.0f}%")
    print(f"💸 Potential fine if caught: {format_currency(chosen_act.fine_amount)}")
    print(f"📉 Reputation damage if caught: -{chosen_act.reputation_penalty:.2f}")
    
    confirm = ask("Proceed with this illegal activity?", ["Yes, commit the crime", "No, stay legal"])
    
    if confirm == 1:
        print("📋 Activity cancelled - remaining legal")
        return False
    
    # Execute simple illegal activity
    print(f"\n🎬 EXECUTING: {chosen_act.name}")
    
    # Roll for detection
    if random.random() < chosen_act.detection_risk:
        print(f"🚨 ILLEGAL ACTIVITY DETECTED!")
        return _handle_simple_detection(state, chosen_act)
    else:
        print(f"✅ Activity completed successfully!")
        state.budget += chosen_act.cost_savings
        state.reputation -= 0.05  # Small reputation hit even if undetected
        print(f"💰 Profit gained: {format_currency(chosen_act.cost_savings)}")
        print(f"🤫 Activity went unnoticed... for now")
        return True


def _handle_simple_detection(state: GameState, act: SimpleIllegalAct) -> bool:
    """Handle detection of simple illegal activity."""
    print_subsection("⚖️ SIMPLE CRIME DETECTED")
    
    detection_sources = [
        "🕵️ Forest Practices Board inspector",
        "📞 Employee whistleblower", 
        "🔍 Routine government audit",
        "📡 Drone surveillance",
        "🥾 First Nations monitoring patrol"
    ]
    
    detection_source = random.choice(detection_sources)
    print(f"Detection source: {detection_source}")
    print(f"💸 Fine imposed: {format_currency(act.fine_amount)}")
    print(f"📉 Reputation damage: -{act.reputation_penalty:.2f}")
    
    # Apply penalties
    state.budget -= act.fine_amount
    state.reputation = max(0.0, state.reputation - act.reputation_penalty)
    
    # Simple bribery option for smaller crimes
    if act.fine_amount < 600000 and state.budget > 50000:
        bribe_amount = int(act.fine_amount * 0.3)
        print(f"\n🔴 BRIBERY OPTION:")
        print(f"💰 Attempt to bribe officials for {format_currency(bribe_amount)}")
        print(f"⚠️  Risk: 40% chance of success, double penalties if caught")
        
        bribe_choice = ask("Attempt bribery?", ["Yes, try to bribe officials", "No, accept legal penalties"])
        
        if bribe_choice == 0:
            if state.budget >= bribe_amount:
                state.budget -= bribe_amount
                if random.random() < 0.4:  # 40% success chance
                    print(f"🤫 Bribery successful - penalties reduced")
                    refund = int(act.fine_amount * 0.7)
                    state.budget += refund
                    print(f"💰 Penalty reduction: {format_currency(refund)}")
                else:
                    print(f"🚨 BRIBERY DETECTED - penalties DOUBLED!")
                    additional_fine = act.fine_amount
                    state.budget -= additional_fine
                    state.reputation = max(0.0, state.reputation - 0.2)
                    print(f"💸 Additional penalties: {format_currency(additional_fine)}")
    
    return True


def _present_complex_operations(state: GameState, available_operations: List[IllegalOperation]) -> bool:
    """Present complex multi-stage operations."""
    print_subsection("🎯 COMPLEX CRIMINAL ENTERPRISES")
    print("💀 Multi-stage operations with escalating risks and massive profits")
    
    print(f"\nAvailable criminal enterprises ({len(available_operations)} options):")
    for i, op in enumerate(available_operations):
        risk_color = "🟢" if op.base_risk < 0.3 else "🟡" if op.base_risk < 0.5 else "🔴"
        print(f"\n{i+1}. {op.name}")
        print(f"   💰 Total potential profit: {format_currency(op.total_profit)}")
        print(f"   {risk_color} Base risk level: {op.base_risk*100:.0f}%")
        print(f"   🎭 Complexity: {op.complexity}")
        print(f"   📖 {op.description}")
    
    options = [op.name for op in available_operations]
    options.append("Cancel - return to simple activities")
    
    choice = ask("Choose criminal enterprise:", options)
    
    if choice == len(available_operations):  # Cancelled
        print("📋 Returning to simple illegal activities")
        return False
    
    chosen_operation = available_operations[choice]
    return _execute_multi_stage_operation(state, chosen_operation)


def _execute_multi_stage_operation(state: GameState, operation: IllegalOperation) -> bool:
    """Execute a multi-stage illegal operation with player navigation."""
    print_subsection(f"🔴 CRIMINAL OPERATION: {operation.name}")
    print(f"📖 Background: {operation.story}")
    print(f"⚠️  This is a multi-stage operation. You can exit at any stage or continue deeper.")
    print(f"💀 Warning: Each stage increases both profits and risks!")
    
    # Confirmation screen
    print(f"\n🚨 FINAL WARNING BEFORE PROCEEDING:")
    print(f"• This operation involves serious criminal activity")
    print(f"• Detection could result in bankruptcy, imprisonment, or worse")
    print(f"• You can be caught at any stage with escalating penalties")
    print(f"• Other criminals may become your enemies or blackmailers")
    
    confirm = ask("Do you absolutely want to proceed with this criminal operation?", 
                  ["Yes, I understand the risks", "No, return to legal operations"])
    
    if confirm == 1:
        print("📋 Returning to legal business operations")
        return False
    
    # Execute stages one by one
    for stage_num, stage in enumerate(operation.stages):
        operation.current_stage = stage_num
        
        print_subsection(f"🎯 {stage['name']}")
        print(f"📋 Operation: {stage['description']}")
        print(f"💰 Stage profit: {format_currency(stage['profit'])}")
        print(f"💸 Stage cost: {format_currency(stage['cost'])}")
        print(f"📈 Risk increase: +{stage['risk_increase']*100:.0f}%")
        print(f"📖 Details: {stage['story']}")
        
        # Calculate current total risk
        current_risk = operation.base_risk + operation.accumulated_risk + stage['risk_increase']
        risk_color = "🟢" if current_risk < 0.3 else "🟡" if current_risk < 0.6 else "🔴"
        print(f"{risk_color} Total detection risk if you proceed: {current_risk*100:.0f}%")
        
        # Stage decision
        stage_options = [
            f"Execute {stage['name']} (Risk: {current_risk*100:.0f}%)",
            "Exit operation now and keep current profits",
            "Get more details about this stage"
        ]
        
        stage_choice = ask(f"Decision for {stage['name']}:", stage_options)
        
        if stage_choice == 1:  # Exit operation
            print(f"🚪 Exiting operation after {stage_num} stages")
            print(f"💰 Total profit secured: {format_currency(operation.accumulated_profit)}")
            state.budget += operation.accumulated_profit
            return True
            
        elif stage_choice == 2:  # Get details
            _show_stage_details(stage, operation, current_risk)
            stage_choice = ask(f"Final decision for {stage['name']}:", 
                             ["Execute this stage", "Exit operation now"])
            if stage_choice == 1:
                print(f"🚪 Exiting operation for safety")
                state.budget += operation.accumulated_profit
                return True
        
        # Execute the stage
        if state.budget < stage['cost']:
            print(f"❌ Insufficient funds for {stage['name']}! Need {format_currency(stage['cost'])}")
            print(f"💰 Total profit secured: {format_currency(operation.accumulated_profit)}")
            state.budget += operation.accumulated_profit
            return True
        
        print(f"\n🎬 EXECUTING: {stage['name']}")
        state.budget -= stage['cost']
        
        # Roll for detection at this stage
        detection_roll = random.random()
        if detection_roll < current_risk:
            print(f"🚨 OPERATION COMPROMISED!")
            return _handle_criminal_detection(state, operation, stage_num, current_risk)
        
        # Stage successful
        print(f"✅ Stage completed successfully!")
        operation.accumulated_profit += stage['profit']
        operation.accumulated_risk += stage['risk_increase']
        
        print(f"💰 Stage profit: {format_currency(stage['profit'])}")
        print(f"💰 Total accumulated profit: {format_currency(operation.accumulated_profit)}")
        
        # Offer continuation to next stage
        if stage_num < len(operation.stages) - 1:
            next_stage = operation.stages[stage_num + 1]
            next_risk = current_risk + next_stage['risk_increase']
            
            print(f"\n🔮 NEXT STAGE PREVIEW: {next_stage['name']}")
            print(f"💰 Next stage profit: {format_currency(next_stage['profit'])}")
            print(f"📈 Next stage risk: {next_risk*100:.0f}%")
            
            continue_choice = ask("Continue to next stage?", 
                                ["Continue deeper into crime", "Exit with current profits"])
            
            if continue_choice == 1:
                print(f"🏁 Operation completed successfully!")
                print(f"💰 Final profit: {format_currency(operation.accumulated_profit)}")
                state.budget += operation.accumulated_profit
                return True
        else:
            # Final stage completed
            print(f"🏁 OPERATION COMPLETED SUCCESSFULLY!")
            print(f"💰 Total profit: {format_currency(operation.accumulated_profit)}")
            state.budget += operation.accumulated_profit
            
            # Massive operation bonus but permanent consequences
            print(f"⚠️  WARNING: You are now a major criminal figure")
            print(f"🎯 Ongoing criminal contacts will approach you regularly")
            print(f"🔍 Law enforcement agencies now monitoring your activities")
            
            # Set criminal status flags
            if not hasattr(state, 'criminal_operations_completed'):
                state.criminal_operations_completed = []
            state.criminal_operations_completed.append(operation.name)
            
            return True
    
    return True


def _handle_criminal_detection(state: GameState, operation: IllegalOperation, stage_num: int, risk_level: float) -> bool:
    """Handle detection during criminal operation with multi-layer bribery options."""
    print_subsection("🚨 CRIMINAL OPERATION DETECTED!")
    
    # Determine who caught you
    detection_sources = [
        "🕵️ RCMP undercover operation",
        "📞 Whistleblower employee report", 
        "🔍 CRA tax investigation",
        "📡 Government surveillance program",
        "🎭 Rival criminal organization tip-off",
        "📰 Investigative journalist exposure"
    ]
    
    detection_source = random.choice(detection_sources)
    print(f"Detection source: {detection_source}")
    
    # Calculate base penalties
    base_fine = int(operation.accumulated_profit * (2 + risk_level))  # 2-3x profits as fine
    criminal_charges_risk = min(0.9, risk_level + 0.3)
    
    print(f"💸 Potential criminal fine: {format_currency(base_fine)}")
    print(f"⚖️ Criminal charges probability: {criminal_charges_risk*100:.0f}%")
    print(f"📉 Reputation damage: -{risk_level:.2f}")
    
    # Multi-layer bribery/escape options
    print(f"\n🤔 How do you handle this crisis?")
    
    escape_options = [
        {
            "name": "Accept full legal consequences",
            "cost": 0,
            "fine_multiplier": 1.0,
            "reputation_penalty": risk_level,
            "success_chance": 1.0,
            "description": "Cooperate fully with authorities, accept all penalties"
        },
        {
            "name": "Hire top criminal defense lawyers",
            "cost": 500000,
            "fine_multiplier": 0.6,
            "reputation_penalty": risk_level * 0.8,
            "success_chance": 0.7,
            "description": "Fight charges with expensive legal team"
        },
        {
            "name": "🔴 Bribe investigating officers (Layer 1)",
            "cost": 300000,
            "fine_multiplier": 0.3,
            "reputation_penalty": risk_level * 0.5,
            "success_chance": 0.6,
            "description": "Attempt to corrupt front-line investigators",
            "illegal": True,
            "bribery_layer": 1
        }
    ]
    
    # Add higher bribery layers if player has enough money
    if state.budget > 1000000:
        escape_options.append({
            "name": "🔴 Bribe senior officials (Layer 2)",
            "cost": 800000,
            "fine_multiplier": 0.2,
            "reputation_penalty": risk_level * 0.3,
            "success_chance": 0.7,
            "description": "Corrupt senior law enforcement officials",
            "illegal": True,
            "bribery_layer": 2
        })
    
    if state.budget > 2500000:
        escape_options.append({
            "name": "🔴 Bribe judges and prosecutors (Layer 3)",
            "cost": 1500000,
            "fine_multiplier": 0.1,
            "reputation_penalty": risk_level * 0.2,
            "success_chance": 0.8,
            "description": "Corrupt the judicial system itself",
            "illegal": True,
            "bribery_layer": 3
        })
    
    if state.budget > 5000000:
        escape_options.append({
            "name": "🔴 Political protection network (Layer 4)",
            "cost": 3000000,
            "fine_multiplier": 0.05,
            "reputation_penalty": risk_level * 0.1,
            "success_chance": 0.9,
            "description": "Buy protection from federal politicians",
            "illegal": True,
            "bribery_layer": 4
        })
    
    for i, option in enumerate(escape_options):
        cost_text = f" - {format_currency(option['cost'])}" if option['cost'] > 0 else " - FREE"
        illegal_text = " ⚠️ ADDITIONAL CRIME" if option.get('illegal') else ""
        print(f"{i+1}. {option['name']}{cost_text}{illegal_text}")
        print(f"   📝 {option['description']}")
        print(f"   🎯 Success chance: {option['success_chance']*100:.0f}%")
    
    choice = ask("Choose your escape strategy:", [opt['name'] for opt in escape_options])
    chosen_option = escape_options[choice]
    
    # Handle bribery confirmation
    if chosen_option.get('illegal'):
        return _execute_bribery_layer(state, chosen_option, base_fine, risk_level, operation)
    else:
        return _execute_legal_response(state, chosen_option, base_fine, risk_level, operation)


def _execute_bribery_layer(state: GameState, option: Dict, base_fine: int, risk_level: float, operation: IllegalOperation) -> bool:
    """Execute a bribery attempt with additional confirmation and consequences."""
    print_subsection(f"🔴 ATTEMPTING BRIBERY: {option['name']}")
    
    bribery_layer = option.get('bribery_layer', 1)
    
    # Escalating warnings based on bribery layer
    warnings = {
        1: "Bribing police officers is a serious federal crime",
        2: "Corrupting senior officials triggers federal investigations", 
        3: "Bribing judges is treason-level corruption",
        4: "Political corruption at this level makes you an enemy of the state"
    }
    
    print(f"🚨 WARNING: {warnings.get(bribery_layer, 'Extreme criminal activity')}")
    print(f"💀 If this bribery is detected, penalties will be MULTIPLIED")
    print(f"⚖️ You could face life imprisonment for these additional crimes")
    
    # Final confirmation
    confirm = ask(f"Are you certain you want to attempt Layer {bribery_layer} bribery?", 
                  ["Yes, proceed with bribery", "No, choose legal option"])
    
    if confirm == 1:
        print("📋 Switching to legal defense strategy")
        return _execute_legal_response(state, {"cost": 500000, "fine_multiplier": 0.6, 
                                             "reputation_penalty": risk_level * 0.8, "success_chance": 0.7}, 
                                     base_fine, risk_level, operation)
    
    # Execute bribery attempt
    if state.budget < option['cost']:
        print(f"❌ Insufficient funds for bribery! Need {format_currency(option['cost'])}")
        print(f"🚨 Forced to accept full legal consequences")
        return _execute_legal_response(state, {"cost": 0, "fine_multiplier": 1.0, 
                                             "reputation_penalty": risk_level, "success_chance": 1.0}, 
                                     base_fine, risk_level, operation)
    
    state.budget -= option['cost']
    print(f"💰 Bribery payment: {format_currency(option['cost'])} transferred")
    
    # Roll for bribery success
    bribery_detection_risk = 0.4 + (bribery_layer * 0.1)  # Higher layers more likely to be detected
    
    if random.random() < option['success_chance']:
        print(f"🤫 BRIBERY SUCCESSFUL!")
        print(f"✅ Officials have been corrupted")
        
        # Apply reduced penalties
        final_fine = int(base_fine * option['fine_multiplier'])
        if final_fine > 0:
            state.budget -= final_fine
            print(f"💸 'Reduced' legal penalties: {format_currency(final_fine)}")
        else:
            print(f"🎯 All legal penalties eliminated through corruption")
        
        # Reputation penalty
        state.reputation = max(0.0, state.reputation - option['reputation_penalty'])
        print(f"📉 Reputation damage: -{option['reputation_penalty']:.2f}")
        
        # But ongoing blackmail consequences
        print(f"\n⚠️ CORRUPTION CONSEQUENCES:")
        print(f"🎭 Corrupt officials now have permanent leverage over you")
        print(f"💰 Expect regular blackmail payments")
        print(f"🔍 You are now monitored by counter-intelligence agencies")
        
        # Set up ongoing blackmail
        if not hasattr(state, 'corrupt_officials'):
            state.corrupt_officials = []
        state.corrupt_officials.append(f"layer_{bribery_layer}_officials")
        
        return True
        
    else:
        print(f"🚨 BRIBERY DETECTED!")
        print(f"💀 Your corruption attempt has been exposed!")
        
        # Massive penalty escalation for detected bribery
        penalty_multiplier = 2 + bribery_layer  # 3x to 6x penalties
        final_fine = int(base_fine * penalty_multiplier)
        
        print(f"⚖️ Original charges PLUS corruption charges filed")
        print(f"💸 Enhanced criminal penalties: {format_currency(final_fine)}")
        print(f"📉 Massive reputation destruction: -{risk_level * 1.5:.2f}")
        
        state.budget -= final_fine
        state.reputation = max(0.0, state.reputation - (risk_level * 1.5))
        
        # Additional consequences for high-level corruption
        if bribery_layer >= 3:
            print(f"🚨 FEDERAL TASK FORCE ACTIVATED")
            print(f"🔍 All assets frozen pending investigation")
            print(f"📰 International media coverage of corruption scandal")
            state.budget = max(0, state.budget - 1000000)  # Asset freeze
        
        return True


def _execute_legal_response(state: GameState, option: Dict, base_fine: int, risk_level: float, operation: IllegalOperation) -> bool:
    """Execute legal response to criminal detection."""
    print_subsection("⚖️ LEGAL CONSEQUENCES")
    
    if state.budget >= option['cost']:
        state.budget -= option['cost']
        if option['cost'] > 0:
            print(f"💰 Legal fees: {format_currency(option['cost'])} paid")
    
    # Roll for legal success
    if random.random() < option['success_chance']:
        print(f"✅ Legal strategy partially successful")
        final_fine = int(base_fine * option['fine_multiplier'])
    else:
        print(f"❌ Legal strategy failed")
        final_fine = base_fine  # Full penalties
    
    state.budget -= final_fine
    state.reputation = max(0.0, state.reputation - option['reputation_penalty'])
    
    print(f"💸 Criminal fine: {format_currency(final_fine)}")
    print(f"📉 Reputation damage: -{option['reputation_penalty']:.2f}")
    print(f"⚖️ Criminal record established")
    
    # Long-term legal consequences
    print(f"\n📋 ONGOING LEGAL CONSEQUENCES:")
    print(f"🔍 Enhanced law enforcement monitoring")
    print(f"📊 Difficulty obtaining permits and contracts")
    print(f"💼 Potential civil lawsuits from victims")
    
    # Track criminal history
    if not hasattr(state, 'criminal_convictions'):
        state.criminal_convictions = 0
    state.criminal_convictions += 1
    
    return True


def _show_stage_details(stage: Dict, operation: IllegalOperation, current_risk: float):
    """Show detailed information about an operation stage."""
    print(f"\n🔍 DETAILED STAGE ANALYSIS: {stage['name']}")
    print(f"📋 Operation: {stage['description']}")
    print(f"💰 Profit: {format_currency(stage['profit'])}")
    print(f"💸 Cost: {format_currency(stage['cost'])}")
    print(f"📈 Risk increase: +{stage['risk_increase']*100:.0f}%")
    print(f"🎯 Total risk if executed: {current_risk*100:.0f}%")
    print(f"📖 Detailed story: {stage['story']}")
    
    # Risk analysis
    if current_risk < 0.3:
        print(f"🟢 RISK ASSESSMENT: Relatively safe operation")
    elif current_risk < 0.6:
        print(f"🟡 RISK ASSESSMENT: Moderate risk of detection")
    else:
        print(f"🔴 RISK ASSESSMENT: High probability of getting caught")
    
    # Potential consequences preview
    if current_risk > 0.5:
        estimated_fine = operation.accumulated_profit * (2 + current_risk)
        print(f"⚠️ Estimated penalties if caught: {format_currency(int(estimated_fine))}")


def _check_prerequisites(state: GameState, prerequisites: List[str]) -> bool:
    """Check if operation prerequisites are met."""
    if not prerequisites:
        return True
    
    for prereq in prerequisites:
        if prereq == "high_budget" and state.budget < 1000000:
            return False
        elif prereq == "poor_reputation" and state.reputation > 0.4:
            return False
        elif prereq == "existing_violations" and not hasattr(state, 'safety_violations'):
            return False
    
    return True


def ongoing_criminal_consequences(state: GameState):
    """Handle ongoing consequences of criminal activities."""
    if not hasattr(state, 'corrupt_officials'):
        return
    
    if len(state.corrupt_officials) > 0 and random.random() < 0.3:  # 30% chance quarterly
        # Blackmail from corrupt officials
        blackmail_source = random.choice(state.corrupt_officials)
        blackmail_amount = random.randint(100000, 500000)
        
        print_subsection("🎭 CRIMINAL BLACKMAIL")
        print(f"📞 Your corrupt contact from {blackmail_source} demands payment")
        print(f"💰 Blackmail demand: {format_currency(blackmail_amount)}")
        print(f"⚠️ Refusal could expose your criminal activities")
        
        choices = ["Pay the blackmail", "Refuse and risk exposure"]
        choice = ask("Blackmail response:", choices)
        
        if choice == 0:  # Pay
            if state.budget >= blackmail_amount:
                state.budget -= blackmail_amount
                print(f"💸 Blackmail paid: {format_currency(blackmail_amount)}")
                print(f"🤫 Your secrets remain safe... for now")
            else:
                print(f"❌ Cannot afford blackmail payment!")
                print(f"🚨 Corrupt officials expose your crimes in revenge!")
                state.reputation = max(0.0, state.reputation - 0.3)
                state.budget -= random.randint(500000, 1500000)  # Fines and penalties
        else:  # Refuse
            print(f"⚖️ Taking the risk of exposure")
            if random.random() < 0.6:  # 60% chance of exposure
                print(f"🚨 Corrupt officials expose your criminal activities!")
                state.reputation = max(0.0, state.reputation - 0.4)
                state.budget -= random.randint(1000000, 3000000)
                # Remove this blackmail source
                state.corrupt_officials.remove(blackmail_source)
            else:
                print(f"🤫 Officials decide to keep quiet for now")