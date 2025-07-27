"""
Illegal Activities System
Handles risky illegal acts, bribes, and Forest Practices Board investigations
"""

import random
from typing import List, Tuple
from game_models import GameState, FirstNation, HarvestBlock, PermitStatus
from utils import ask, print_subsection, format_currency


class IllegalAct:
    def __init__(self, name: str, description: str, cost_savings: int, detection_risk: float, 
                 reputation_penalty: float, fine_amount: int, complexity: str = "simple",
                 prerequisites: list = None, consequences: dict = None, story: str = ""):
        self.name = name
        self.description = description
        self.cost_savings = cost_savings
        self.detection_risk = detection_risk  # 0.0 to 1.0
        self.reputation_penalty = reputation_penalty
        self.fine_amount = fine_amount
        self.complexity = complexity  # "simple", "complex", "multi-stage"
        self.prerequisites = prerequisites or []  # Required conditions
        self.consequences = consequences or {}  # Long-term effects
        self.story = story  # Narrative backstory


def illegal_opportunities(state: GameState) -> bool:
    """Present illegal activity opportunities with risk/reward."""
    if random.random() > 0.6:  # 60% chance of illegal opportunities
        return False
    
    print_subsection("🔴 UNDER-THE-TABLE OPPORTUNITIES")
    print("💀 WARNING: These activities violate forest practices regulations!")
    print("Risk of detection by Forest Practices Board, media, or whistleblowers")
    
    # Comprehensive list of illegal activities with depth and complexity
    all_illegal_acts = [
        IllegalAct(
            name="The Cathedral Grove Heist",
            description="Harvest ancient trees from protected old-growth area under cover of darkness",
            cost_savings=850000,
            detection_risk=0.6,
            reputation_penalty=0.7,
            fine_amount=2500000,
            complexity="multi-stage",
            prerequisites=["old_growth_deferrals_expanded"],
            consequences={"media_attention": True, "environmental_groups_boycott": True},
            story="A contact in the logging crew discovered a section of 500-year-old Douglas Fir that 'accidentally' wasn't included in the deferral mapping. Each tree is worth $15,000+ in premium lumber markets. The entire grove could net nearly $1M, but harvesting them would be highly illegal and environmentally devastating."
        ),
        
        IllegalAct(
            name="The Midnight Burial Ground Operation",
            description="Harvest around indigenous burial sites after 'losing' the archaeological survey",
            cost_savings=420000,
            detection_risk=0.4,
            reputation_penalty=0.8,
            fine_amount=1800000,
            complexity="complex",
            prerequisites=["heritage_not_cleared"],
            consequences={"first_nations_rage": True, "spiritual_curse": True, "media_scandal": True},
            story="Your site supervisor discovered what appears to be an ancient burial ground, but the archaeological survey is taking forever. A corrupt surveyor offers to 'lose' the paperwork for $20,000, allowing harvest to continue. However, the local First Nation considers this site sacred."
        ),
        
        IllegalAct(
            name="Operation Timber Smuggler",
            description="Create a secret timber laundering operation through shell companies",
            cost_savings=1200000,
            detection_risk=0.3,
            reputation_penalty=0.6,
            fine_amount=4500000,
            complexity="multi-stage",
            prerequisites=["multiple_harvest_blocks"],
            consequences={"criminal_investigation": True, "money_laundering_charges": True},
            story="A 'business consultant' proposes setting up shell companies to hide excess timber sales. The operation would involve fake invoices, offshore accounts, and bribing customs officials. Extremely profitable but potentially catastrophic if discovered."
        ),
        
        IllegalAct(
            name="The Poison Creek Conspiracy",
            description="Dump chemical waste into remote watershed, blame it on 'natural runoff'",
            cost_savings=280000,
            detection_risk=0.5,
            reputation_penalty=0.9,
            fine_amount=2800000,
            complexity="complex",
            consequences={"water_contamination": True, "fish_kill": True, "class_action_lawsuit": True},
            story="Your equipment maintenance creates toxic waste that costs $80,000 to dispose properly. A crew leader suggests dumping it in a remote creek that 'no one will ever check.' The downstream community depends on this watershed for drinking water."
        ),
        
        IllegalAct(
            name="The Ghost Forest Gambit",
            description="Harvest beetle-killed trees from national park boundaries under 'sanitation' pretense",
            cost_savings=680000,
            detection_risk=0.6,
            reputation_penalty=0.5,
            fine_amount=2100000,
            complexity="complex",
            prerequisites=["beetle_outbreak"],
            consequences={"park_service_investigation": True, "tourism_backlash": True},
            story="A massive beetle outbreak near a national park creates an opportunity. Park officials are overwhelmed, and you could harvest valuable beetle-killed timber under the guise of 'emergency sanitation.' Park boundaries are poorly marked in this remote area."
        ),
        
        IllegalAct(
            name="The Forged Inspector Scheme",
            description="Create fake government inspection documents using stolen inspector credentials",
            cost_savings=150000,
            detection_risk=0.7,
            reputation_penalty=0.8,
            fine_amount=1000000,
            complexity="multi-stage",
            consequences={"identity_theft_charges": True, "government_fraud": True, "inspector_fired": True},
            story="A disgruntled former government inspector offers to provide you with official inspection stamps and signatures for $30,000. This would allow you to bypass all safety and environmental inspections, but using stolen government credentials is a federal crime."
        ),
        
        IllegalAct(
            name="The Wildfire Window",
            description="Start controlled fires to create 'emergency' salvage harvesting opportunities",
            cost_savings=250000,
            detection_risk=0.8,
            reputation_penalty=1.0,
            fine_amount=1500000,
            complexity="multi-stage",
            consequences={"arson_charges": True, "insurance_fraud": True, "potential_casualties": True},
            story="A pyromaniac crew member suggests starting 'controlled' fires in competitor's forests, then swooping in with salvage permits while timber prices spike during the fire emergency. Extremely dangerous and likely to get people killed."
        ),
        
        IllegalAct(
            name="The Stumpage Evasion Network",
            description="Set up elaborate tax avoidance scheme to avoid paying government stumpage fees",
            cost_savings=200000,
            detection_risk=0.4,
            reputation_penalty=0.4,
            fine_amount=800000,
            complexity="complex",
            consequences={"tax_evasion_charges": True, "cra_audit": True},
            story="An accountant with mob connections offers to set up a sophisticated tax avoidance scheme involving fake exports, transfer pricing, and offshore companies. The government loses millions in revenue, but the scheme is 'technically legal' until it isn't."
        ),
        
        IllegalAct(
            name="The Equipment Sabotage Scam",
            description="Sabotage competitor's equipment and steal their harvest contracts",
            cost_savings=120000,
            detection_risk=0.6,
            reputation_penalty=0.6,
            fine_amount=500000,
            complexity="complex",
            consequences={"criminal_mischief": True, "restraining_order": True, "competitor_retaliation": True},
            story="Your main competitor just won a major contract you wanted. A mechanic offers to 'accidentally' damage their equipment during a joint operation, forcing them to default on the contract. You'd get the contract, but the competitor might retaliate."
        ),
        
        IllegalAct(
            name="The Blackmail Senator Operation",
            description="Use compromising photos of politician to influence forestry regulations",
            cost_savings=400000,
            detection_risk=0.9,
            reputation_penalty=0.9,
            fine_amount=2000000,
            complexity="multi-stage",
            consequences={"extortion_charges": True, "political_scandal": True, "organized_crime_investigation": True},
            story="A private investigator claims to have compromising photos of a key senator who votes on forestry legislation. For $50,000, you could blackmail them into supporting industry-friendly bills. This is extremely illegal and would likely trigger a major political scandal."
        ),
        
        IllegalAct(
            name="The Human Trafficking Labor Scheme",
            description="Use undocumented workers in dangerous conditions for cheap labor",
            cost_savings=180000,
            detection_risk=0.5,
            reputation_penalty=1.0,
            fine_amount=1800000,
            complexity="complex",
            consequences={"human_trafficking_charges": True, "worker_deaths": True, "international_incident": True},
            story="A labor contractor offers to provide 'very cheap' workers who 'won't complain about safety conditions.' These workers are undocumented and essentially enslaved. Extremely profitable but morally horrific and carries severe criminal penalties."
        ),
        
        IllegalAct(
            name="The Carbon Credit Fraud",
            description="Falsify carbon offset data to sell fake environmental credits",
            cost_savings=160000,
            detection_risk=0.3,
            reputation_penalty=0.7,
            fine_amount=700000,
            complexity="complex",
            consequences={"securities_fraud": True, "environmental_audit": True},
            story="With carbon credits becoming valuable, a consultant suggests inflating your forest carbon storage numbers and selling fake offsets to corporations. The money is excellent, but environmental auditors are getting more sophisticated."
        ),
        
        IllegalAct(
            name="The Mayor's Daughter Wedding Fund",
            description="Bribe local mayor by paying for his daughter's expensive wedding",
            cost_savings=90000,
            detection_risk=0.4,
            reputation_penalty=0.5,
            fine_amount=400000,
            complexity="simple",
            consequences={"corruption_charges": True, "mayor_investigation": True},
            story="The local mayor has been slow-walking your permits. His daughter is getting married and needs $50,000 for the wedding. If you 'sponsor' the wedding, your permits might get fast-tracked. It's bribery, but it's also a nice gesture, right?"
        ),
        
        IllegalAct(
            name="The Endangered Species Relocator",
            description="Secretly relocate protected wildlife to allow harvest in critical habitat",
            cost_savings=540000,
            detection_risk=0.7,
            reputation_penalty=0.8,
            fine_amount=2400000,
            complexity="complex",
            consequences={"wildlife_violations": True, "species_disruption": True},
            story="Your harvest area contains a spotted owl nest, blocking the entire operation worth $600K+. A wildlife 'expert' offers to relocate the owls to a different area for $25,000. The owls might not survive the relocation, and moving endangered species is highly illegal."
        ),
        
        # NEW HIGH-STAKES OPERATIONS
        IllegalAct(
            name="The International Timber Cartel",
            description="Join organized crime syndicate smuggling premium BC timber to Asia",
            cost_savings=2800000,
            detection_risk=0.4,
            reputation_penalty=0.9,
            fine_amount=8500000,
            complexity="multi-stage",
            consequences={"criminal_organization": True, "international_investigation": True, "rcmp_surveillance": True},
            story="A mysterious contact with connections to Asian luxury furniture markets offers to buy your entire annual production at 4x market rates. No questions asked, cash payments to offshore accounts. The profits are staggering, but this is clearly organized crime territory."
        ),
        
        IllegalAct(
            name="The Government Permit Insider",
            description="Bribe senior government official to pre-approve all permits and block competitors",
            cost_savings=1500000,
            detection_risk=0.6,
            reputation_penalty=0.8,
            fine_amount=5000000,
            complexity="multi-stage",
            consequences={"corruption_scandal": True, "government_investigation": True, "competitor_lawsuits": True},
            story="A Deputy Minister hints that for $200K annually, your permits could be 'fast-tracked' while competitors face mysterious delays. The competitive advantage would be enormous, essentially guaranteeing market dominance, but corruption at this level risks bringing down governments."
        ),
        
        IllegalAct(
            name="The First Nations Band Council Takeover",
            description="Install puppet leadership in Indigenous community through bribery and intimidation",
            cost_savings=1800000,
            detection_risk=0.8,
            reputation_penalty=1.0,
            fine_amount=6000000,
            complexity="multi-stage",
            consequences={"federal_investigation": True, "indigenous_rights_violation": True, "international_condemnation": True},
            story="A corrupt consultant claims they can 'influence' upcoming band council elections to install leadership friendly to your operations. The new council would sign resource sharing agreements worth millions, but this crosses into indigenous rights violations that could trigger federal intervention."
        ),
        
        IllegalAct(
            name="The Climate Data Manipulation Scheme",
            description="Falsify carbon storage data to sell massive fraudulent carbon credits",
            cost_savings=3200000,
            detection_risk=0.3,
            reputation_penalty=0.7,
            fine_amount=9600000,
            complexity="multi-stage",
            consequences={"securities_fraud": True, "environmental_audit": True, "carbon_market_ban": True},
            story="With carbon credits worth $50-100 per tonne, a data analyst offers to inflate your forest carbon storage calculations by 300%. You could sell millions in fraudulent credits to corporations desperate to offset emissions. The carbon market is poorly regulated, making detection unlikely."
        ),
        
        IllegalAct(
            name="The Wildfire Insurance Fraud",
            description="Deliberately start wildfires then claim insurance and emergency harvesting permits",
            cost_savings=2400000,
            detection_risk=0.9,
            reputation_penalty=1.0,
            fine_amount=12000000,
            complexity="multi-stage",
            consequences={"arson_charges": True, "insurance_fraud": True, "potential_deaths": True, "terrorism_charges": True},
            story="An unstable crew member suggests starting 'controlled' wildfires during extreme fire weather. Insurance payouts plus emergency salvage permits could net $2.5M+. However, wildfires are unpredictable - people could die, and deliberately causing wildfires is considered domestic terrorism."
        ),
        
        IllegalAct(
            name="The Cocaine Smuggling Partnership",
            description="Use logging trucks and remote camps to smuggle drugs from US border",
            cost_savings=4500000,
            detection_risk=0.7,
            reputation_penalty=1.0,
            fine_amount=15000000,
            complexity="multi-stage",
            consequences={"drug_trafficking": True, "organized_crime": True, "asset_forfeiture": True, "life_imprisonment": True},
            story="Drug smugglers approach you about using your remote logging roads and camps to move cocaine from the US border. They offer $500K per shipment, with potential for 10+ shipments annually. The money is life-changing, but drug trafficking carries 25-year prison sentences."
        ),
        
        IllegalAct(
            name="The Aboriginal Artifact Trafficking Ring",
            description="Secretly excavate and sell indigenous artifacts found on harvesting sites",
            cost_savings=950000,
            detection_risk=0.5,
            reputation_penalty=0.9,
            fine_amount=3800000,
            complexity="complex",
            consequences={"cultural_destruction": True, "heritage_crime": True, "indigenous_rage": True, "international_art_crime": True},
            story="Your crews discovered a burial site containing ancient artifacts worth hundreds of thousands on international black markets. A dealer offers to 'quietly remove' the artifacts before heritage officials arrive. The profits are substantial, but you'd be destroying irreplaceable cultural heritage."
        ),
        
        IllegalAct(
            name="The Land Title Fraud Conspiracy",
            description="Forge documents to claim ownership of Crown land through shell companies",
            cost_savings=5800000,
            detection_risk=0.6,
            reputation_penalty=0.8,
            fine_amount=17400000,
            complexity="multi-stage",
            consequences={"land_fraud": True, "document_forgery": True, "government_investigation": True, "asset_seizure": True},
            story="A lawyer with connections to the land title office claims they can create fake ownership documents for prime Crown forestland. By creating shell companies and forged historical land grants, you could 'own' millions of dollars worth of timber rights. The legal system is slow to catch sophisticated fraud."
        )
    ]
    
    # Randomly select 2-4 available illegal acts each time
    num_opportunities = random.randint(2, 4)
    available_acts = random.sample(all_illegal_acts, min(num_opportunities, len(all_illegal_acts)))
    
    # Add context-specific opportunities
    context_acts = []
    
    if state.old_growth_deferrals_expanded:
        context_acts.append(all_illegal_acts[0])  # Old-growth harvesting
    
    if any(not block.heritage_cleared for block in state.harvest_blocks):
        context_acts.append(all_illegal_acts[1])  # Heritage buffer violations
        
    if any(block.permit_status == PermitStatus.APPROVED for block in state.harvest_blocks):
        context_acts.append(all_illegal_acts[2])  # Volume limit violations
    
    # Combine random and context-specific opportunities (remove duplicates)
    all_available = list({act.name: act for act in (available_acts + context_acts)}.values())
    
    if not all_available:
        return False
    
    print(f"\nAvailable 'opportunities' ({len(all_available)} options this quarter):")
    for i, act in enumerate(all_available):
        risk_color = "🟢" if act.detection_risk < 0.3 else "🟡" if act.detection_risk < 0.6 else "🔴"
        print(f"{i+1}. {act.name}")
        print(f"   💰 Potential savings: {format_currency(act.cost_savings)}")
        print(f"   {risk_color} Detection risk: {act.detection_risk*100:.0f}%")
        print(f"   💸 Potential fine: {format_currency(act.fine_amount)}")
        print(f"   📉 Reputation damage: -{act.reputation_penalty:.1f}")
        print(f"   📝 {act.description}")
    
    options = [f"Commit to {act.name}" for act in all_available]
    options.append("Decline all illegal activities (stay legal)")
    
    choice = ask("Choose your approach:", options)
    
    if choice == len(all_available):  # Declined
        print("🎖️  Maintaining legal compliance and ethical standards")
        state.reputation += 0.05  # Small reputation bonus for staying legal
        return False
    
    chosen_act = all_available[choice]
    print(f"\n💀 Proceeding with: {chosen_act.name}")
    
    # Offer bribery to reduce detection risk
    bribery_offered = _offer_bribery_options(state, chosen_act)
    
    # Execute the illegal act
    return _execute_illegal_act(state, chosen_act, bribery_offered)


def _offer_bribery_options(state: GameState, act: IllegalAct) -> dict:
    """Offer bribery options to reduce detection risk."""
    print_subsection("🤝 BRIBERY OPTIONS")
    print("💰 You can attempt to reduce detection risk through 'incentives'")
    
    bribery_options = [
        {
            "name": "Bribe local officials",
            "cost": 25000,
            "risk_reduction": 0.2,
            "bribery_detection_risk": 0.3,
            "description": "Pay local government officials to look the other way"
        },
        {
            "name": "Bribe First Nations representatives",
            "cost": 40000,
            "risk_reduction": 0.15,
            "bribery_detection_risk": 0.4,
            "description": "Attempt to buy silence from Indigenous communities"
        },
        {
            "name": "Bribe Forest Practices Board inspector",
            "cost": 60000,
            "risk_reduction": 0.3,
            "bribery_detection_risk": 0.5,
            "description": "Try to corrupt the regulatory inspector"
        }
    ]
    
    print("Available bribery options:")
    for i, option in enumerate(bribery_options):
        risk_color = "🟢" if option["bribery_detection_risk"] < 0.3 else "🟡" if option["bribery_detection_risk"] < 0.5 else "🔴"
        print(f"{i+1}. {option['name']} - {format_currency(option['cost'])}")
        print(f"   📉 Reduces detection risk by {option['risk_reduction']*100:.0f}%")
        print(f"   {risk_color} Bribery detection risk: {option['bribery_detection_risk']*100:.0f}%")
        print(f"   📝 {option['description']}")
    
    choice_options = [f"Pay {option['name']} ({format_currency(option['cost'])})" for option in bribery_options]
    choice_options.append("No bribes (accept full detection risk)")
    
    choice = ask("Bribery approach:", choice_options)
    
    if choice == len(bribery_options):  # No bribes
        print("💼 Proceeding without bribes")
        return {}
    
    chosen_bribe = bribery_options[choice]
    
    if state.budget < chosen_bribe["cost"]:
        print(f"💸 Insufficient funds for bribery! Need {format_currency(chosen_bribe['cost'])}")
        return {}
    
    state.budget -= chosen_bribe["cost"]
    print(f"💰 Paid {format_currency(chosen_bribe['cost'])} in bribes")
    
    # Check if bribery is detected
    if random.random() < chosen_bribe["bribery_detection_risk"]:
        print("🚨 BRIBERY DETECTED! This will make things much worse...")
        chosen_bribe["detected"] = True
        return chosen_bribe
    
    print("🤫 Bribery successful - detection risk reduced")
    chosen_bribe["detected"] = False
    return chosen_bribe


def _execute_illegal_act(state: GameState, act: IllegalAct, bribery: dict) -> bool:
    """Execute the illegal act and determine consequences."""
    print_subsection("🎲 ROLLING THE DICE")
    
    # Calculate final detection risk
    detection_risk = act.detection_risk
    if bribery and not bribery.get("detected", False):
        detection_risk -= bribery["risk_reduction"]
        detection_risk = max(0.05, detection_risk)  # Minimum 5% risk
    
    print(f"Final detection risk: {detection_risk*100:.0f}%")
    state.budget += act.cost_savings
    print(f"💰 Gained {format_currency(act.cost_savings)} from illegal activity")
    
    # Roll for detection
    detected = random.random() < detection_risk
    
    if detected:
        print("🚨 ILLEGAL ACTIVITY DETECTED!")
        return _handle_detection(state, act, bribery)
    else:
        print("🤫 Activity went unnoticed... for now")
        print("⚠️  Risk of future investigation remains")
        
        # Small reputation hit even if undetected (rumors, etc.)
        state.reputation -= 0.1
        return True


def _handle_detection(state: GameState, act: IllegalAct, bribery: dict) -> bool:
    """Handle the consequences of being caught."""
    print_subsection("⚖️  FOREST PRACTICES BOARD INVESTIGATION")
    
    # Determine who caught you
    detection_source = random.choice([
        "🕵️  Whistleblower employee reported the activity",
        "📡 Satellite monitoring detected unauthorized harvesting", 
        "🥾 Surprise inspection by Forest Practices Board",
        "📰 Investigative journalist uncovered evidence",
        "🦅 First Nations monitoring team documented violations"
    ])
    
    print(detection_source)
    
    # Calculate penalties
    fine = act.fine_amount
    reputation_damage = act.reputation_penalty
    
    # Bribery makes things worse if detected
    if bribery and bribery.get("detected", False):
        fine *= 2
        reputation_damage *= 1.5
        print("💀 Bribery discovery DOUBLES the penalties!")
        
        # Additional consequences for bribing First Nations
        if "First Nations" in bribery["name"]:
            print("🚨 Bribing First Nations creates international incident!")
            for fn in state.first_nations:
                fn.relationship_level = 0.1  # Destroy relationships
                fn.agreement_signed = False
            state.social_license_maintained = False
    
    print(f"💸 Fine imposed: {format_currency(fine)}")
    print(f"📉 Reputation damage: -{reputation_damage:.1f}")
    
    state.budget -= fine
    state.reputation -= reputation_damage
    
    # Additional consequences
    print("\nAdditional consequences:")
    print("⏸️  All pending permits suspended for review")
    for block in state.harvest_blocks:
        if block.permit_status == PermitStatus.PENDING:
            block.permit_status = PermitStatus.DELAYED
    
    print("📋 Enhanced monitoring for 2 years")
    print("⚖️  Possible criminal charges under investigation")
    
    # Check if this kills the company
    if state.budget < 0:
        print("💀 Company bankruptcy due to fines and legal costs!")
        return False
    
    if state.reputation < 0.1:
        print("💀 Total loss of social license to operate!")
        return False
    
    return True


def ongoing_investigation_effects(state: GameState):
    """Handle ongoing effects of past illegal activities."""
    # This could be called each quarter to add lingering effects
    if state.reputation < 0.3:  # Company under scrutiny
        if random.random() < 0.2:  # 20% chance of additional problems
            problems = [
                "🔍 Media investigation uncovers additional violations",
                "👥 Employee lawsuit for unsafe working conditions", 
                "🏛️  Parliamentary committee calls for testimony",
                "💰 Insurance premiums increased due to risk profile",
                "🌍 International boycott of company products"
            ]
            
            problem = random.choice(problems)
            cost = random.randint(50000, 200000)
            
            print_subsection("🚨 ONGOING CONSEQUENCES")
            print(problem)
            print(f"💸 Additional costs: {format_currency(cost)}")
            
            state.budget -= cost
            state.reputation -= 0.05