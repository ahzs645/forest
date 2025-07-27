"""
Wacky Events System
Handles bizarre, humorous, and outrageous events that can occur in BC forestry
"""

import random
from game_models import GameState, HarvestBlock, PermitStatus
from utils import print_subsection, format_currency, format_volume, ask


def quarterly_wacky_events(state: GameState):
    """Generate bizarre quarterly events to keep the game entertaining."""
    if random.random() > 0.4:  # 40% chance of wacky events each quarter
        return
    
    print_subsection("🎪 BIZARRE QUARTERLY EVENTS")
    
    wacky_events = [
        _sasquatch_sighting,
        _social_media_viral,
        _celebrity_endorsement,
        _alien_landing,
        _time_traveler_warning,
        _dragon_nesting,
        _ghost_logger_haunting,
        _tree_unionization,
        _squirrel_mafia,
        _crypto_forest_mining,
        _forest_reality_tv_show,
        _unicorn_sanctuary,
        _zombie_apocalypse_drill,
        _bigfoot_job_application,
        _quantum_forest_phase
    ]
    
    # More wacky events in certain seasons
    if state.quarter == 2:  # Spring - nature is awakening
        wacky_events.extend([_sasquatch_sighting, _dragon_nesting, _unicorn_sanctuary])
    elif state.quarter == 4:  # Winter - weird stuff happens in isolation
        wacky_events.extend([_ghost_logger_haunting, _time_traveler_warning, _zombie_apocalypse_drill])
    
    event = random.choice(wacky_events)
    event(state)


def _sasquatch_sighting(state: GameState):
    """Sasquatch spotted in harvest area."""
    print("🦍 BREAKING: Sasquatch Family Establishes Homestead in Harvest Block!")
    print("   📹 Blurry footage goes viral on TikTok")
    print("   🎬 Netflix offers $2M for documentary rights")
    
    # Find a random harvest block
    if state.harvest_blocks:
        block = random.choice(state.harvest_blocks)
        print(f"   📍 Location: {block.id}")
        
        options = [
            "Negotiate with Sasquatch family for coexistence ($50,000 in organic berries)",
            "Hire cryptozoologist to study them ($75,000)",
            "Sell documentary rights and relocate block ($100,000 profit)",
            "Ignore it and hope they leave"
        ]
        
        choice = ask("How do you handle the Sasquatch situation?", options)
        
        if choice == 0:
            state.budget -= 50000
            state.reputation += 0.2
            print("🤝 Sasquatch family agrees to sustainable coexistence!")
            print("   📈 Reputation boost for progressive wildlife management")
            
        elif choice == 1:
            state.budget -= 75000
            print("🔬 Cryptozoologist discovers Sasquatch are excellent forest managers")
            print("   📊 Biodiversity increases dramatically in their area")
            state.biodiversity_score += 0.15
            
        elif choice == 2:
            state.budget += 100000
            state.harvest_blocks.remove(block)
            print("🎥 Netflix deal signed! Block relocated to protect Sasquatch habitat")
            print("   💰 Documentary rights provide unexpected revenue")
            
        else:
            print("🏃 Sasquatch family moves on after logging trucks disturb their peace")
            print("   📱 Viral video of Sasquatch giving your company 1-star review")
            state.reputation -= 0.1


def _social_media_viral(state: GameState):
    """Company goes viral on social media."""
    scenarios = [
        ("🐿️ Squirrel wearing tiny hard hat becomes company mascot", 0.2, 50000),
        ("📱 TikTok dance trend starts among forestry workers", 0.15, 30000),
        ("🎵 Logger's song about responsible forestry tops Spotify charts", 0.3, 100000),
        ("🤖 AI generates forest memes about your company", -0.1, -25000),
        ("👻 Haunted chainsaw video gets 50M views", 0.1, 75000)
    ]
    
    scenario, rep_change, money_change = random.choice(scenarios)
    print(scenario)
    
    if money_change > 0:
        print(f"   💰 Merchandise sales generate {format_currency(money_change)}")
        state.budget += money_change
    elif money_change < 0:
        print(f"   💸 Damage control costs {format_currency(abs(money_change))}")
        state.budget += money_change  # money_change is negative
    
    state.reputation += rep_change
    print(f"   📊 Reputation change: {rep_change:+.1f}")


def _celebrity_endorsement(state: GameState):
    """Random celebrity becomes involved."""
    celebrities = [
        ("🎭 Ryan Reynolds", "makes sarcastic commercials about sustainable logging", 0.25, 150000),
        ("🎸 Neil Young", "writes protest song, then realizes you're actually environmentally responsible", 0.2, 80000),
        ("🏒 Wayne Gretzky", "uses your wood for custom hockey sticks", 0.15, 60000),
        ("🍁 Justin Trudeau", "accidentally photobombs your logging operation", 0.1, 40000),
        ("🦫 Deadpool", "somehow breaks the fourth wall into your forest", 0.3, 200000)
    ]
    
    celebrity, action, rep_boost, revenue = random.choice(celebrities)
    print(f"{celebrity} {action}")
    print(f"   📈 Massive publicity boost!")
    print(f"   💰 Revenue from licensing deals: {format_currency(revenue)}")
    
    state.budget += revenue
    state.reputation += rep_boost


def _alien_landing(state: GameState):
    """Aliens land in the forest."""
    print("🛸 FIRST CONTACT: Alien Spacecraft Lands in Logging Road!")
    print("   👽 Aliens study Earth's 'primitive' forestry techniques")
    
    options = [
        "Trade alien technology for Earth wood samples",
        "Offer aliens jobs in forest management", 
        "Ask aliens for advice on sustainable practices",
        "Pretend you didn't see anything"
    ]
    
    choice = ask("How do you respond to alien contact?", options)
    
    if choice == 0:
        print("🔬 Aliens give you matter replicator in exchange for maple samples")
        print("   ⚡ Operating costs reduced by 50% for next 4 quarters")
        state.operating_cost_per_m3 = int(state.operating_cost_per_m3 * 0.5)
        
    elif choice == 1:
        print("👽 Aliens join workforce as 'Interdimensional Forest Consultants'")
        print("   🚀 Productivity increases beyond human comprehension")
        state.jobs_created += 100  # Alien workers are super productive
        state.reputation += 0.2
        
    elif choice == 2:
        print("🌌 Aliens share advanced ecological knowledge")
        print("   📊 Biodiversity management reaches galactic standards")
        state.biodiversity_score = min(1.0, state.biodiversity_score + 0.3)
        
    else:
        print("👀 Government agents arrive and confiscate all your equipment")
        print("   🕴️ Men in Black want to 'discuss' what you didn't see")
        state.budget -= 100000


def _time_traveler_warning(state: GameState):
    """Time traveler brings warning from the future."""
    print("⏰ TIME TRAVELER ALERT: Visitor from 2087 materializes at your office!")
    
    warnings = [
        ("🌊 Future climate change will flood this area - relocate to higher ground", "avoid future disaster"),
        ("🤖 Robot trees will rebel in 2045 - be nicer to them now", "prevent robot uprising"),
        ("🦕 Dinosaurs return in 2055 - they love your forest management style", "gain dinosaur allies"),
        ("💎 Rare minerals discovered under your forest in 2078", "secure mineral rights")
    ]
    
    warning, outcome = random.choice(warnings)
    print(f"   📢 WARNING: {warning}")
    
    if ask(f"Do you heed the time traveler's warning?", ["Yes", "No"]) == 0:
        print(f"✅ Time traveler approves! You will {outcome}")
        print("   ⚡ Future benefits locked in!")
        state.reputation += 0.1
        
        # Add some immediate benefit for believing
        benefit = random.choice([
            ("📈 Stock prices jump on 'visionary leadership'", 75000),
            ("🔮 Psychic investors fund your operations", 100000),
            ("📰 Time travel story boosts tourism", 50000)
        ])
        print(f"   {benefit[0]}")
        state.budget += benefit[1]
    else:
        print("❌ Time traveler shakes head sadly and vanishes")
        print("   ⚠️ You may have missed a crucial opportunity...")


def _dragon_nesting(state: GameState):
    """Dragons decide to nest in old-growth forest."""
    print("🐉 ANCIENT AWAKENING: Dragons establish nesting ground in old-growth area!")
    print("   🔥 Fire-breathing creates natural firebreaks")
    print("   🥚 Baby dragons are incredibly cute")
    
    if any(block.old_growth_affected for block in state.harvest_blocks):
        options = [
            "Establish dragon sanctuary and ecotourism ($200,000 investment)",
            "Negotiate dragon fire insurance policy",
            "Offer dragons employment as natural fire management",
            "Try to relocate dragons (risky)"
        ]
        
        choice = ask("How do you handle the dragon situation?", options)
        
        if choice == 0:
            state.budget -= 200000
            print("🎪 Dragon sanctuary becomes world's #1 tourist destination!")
            print("   💰 Tourism revenue: $500,000 per quarter")
            state.budget += 500000
            state.reputation += 0.4
            
        elif choice == 1:
            print("📋 Dragons agree to controlled burns for forest health")
            print("   🔥 Wildfire risk eliminated in exchange for sheep deliveries")
            state.budget -= 25000  # Sheep costs
            
        elif choice == 2:
            print("🔥 Dragons become official Fire Management Consultants")
            print("   ⚡ Most effective fire prevention program in BC history")
            state.reputation += 0.3
            
        else:
            if random.random() < 0.3:  # 30% chance of success
                print("✅ Dragons relocate to remote mountain peaks")
            else:
                print("🔥 Dragons are offended and burn down your equipment!")
                state.budget -= 300000


def _ghost_logger_haunting(state: GameState):
    """Ghost of old-time logger haunts operations."""
    print("👻 SPECTRAL ENCOUNTER: Ghost of 1890s logger appears at work site!")
    print("   🪓 Spirit of 'Axe-Handle Pete' judges your modern methods")
    
    options = [
        "Hold séance to understand what the ghost wants",
        "Hire ghost as 'Spiritual Forest Advisor'",
        "Ignore ghost and continue operations",
        "Offer ghost modern chainsaw to try"
    ]
    
    choice = ask("How do you deal with the haunting?", options)
    
    if choice == 0:
        print("🔮 Ghost reveals location of buried treasure from old logging camp!")
        treasure = random.randint(50000, 150000)
        print(f"   💰 Treasure worth {format_currency(treasure)} discovered!")
        state.budget += treasure
        
    elif choice == 1:
        print("👻 Ghost Pete shares 130 years of forest wisdom")
        print("   📚 Historical logging knowledge improves efficiency")
        state.survival_bonus += 0.1
        state.reputation += 0.15
        
    elif choice == 2:
        print("😤 Ghost becomes increasingly aggressive")
        print("   ⚠️ Equipment mysteriously breaks down frequently")
        state.budget -= 50000
        
    else:
        print("🪓 Ghost tries chainsaw and accidentally cuts himself in half again")
        print("   😂 Comedy gold goes viral - marketing value immense!")
        state.reputation += 0.2


def _tree_unionization(state: GameState):
    """Trees attempt to form a union."""
    print("🌳 LABOR DISPUTE: Trees attempt to form 'International Brotherhood of Photosynthetic Workers'!")
    print("   📋 Demands include: Better soil conditions, more sunlight breaks, anti-beetle protection")
    
    options = [
        "Negotiate with tree union representatives",
        "Hire tree lawyer for legal proceedings",
        "Improve tree working conditions",
        "Declare trees are not employees"
    ]
    
    choice = ask("How do you respond to tree unionization?", options)
    
    if choice == 0:
        print("🤝 Successful negotiations with Maple Local 247")
        print("   📊 Productivity increases due to happier trees")
        state.biodiversity_score += 0.1
        state.reputation += 0.2
        
    elif choice == 1:
        print("⚖️ Tree lawyer argues trees have rights under British Common Law")
        print("   📰 Case goes to Supreme Court of Canada")
        state.budget -= 100000
        
    elif choice == 2:
        print("💚 Enhanced forest management program implemented")
        print("   🌱 Trees vote to end strike and return to photosynthesis")
        state.budget -= 75000
        state.biodiversity_score += 0.2
        
    else:
        print("🌳 Trees retaliate by dropping branches on equipment")
        print("   ⚠️ Workplace safety incidents increase dramatically")
        state.budget -= 80000


def _squirrel_mafia(state: GameState):
    """Squirrel organized crime family moves in."""
    print("🐿️ ORGANIZED CRIME: Squirrel Mafia establishes protection racket!")
    print("   🥜 'Nutty' Sal demands protection payments for your equipment")
    
    payment = 15000
    options = [
        f"Pay protection money ({format_currency(payment)})",
        "Hire anti-squirrel security team",
        "Negotiate peace treaty with squirrel don",
        "Fight the squirrel mafia"
    ]
    
    choice = ask("How do you deal with organized squirrel crime?", options)
    
    if choice == 0:
        state.budget -= payment
        print("🤝 Squirrel family provides excellent equipment security")
        print("   🛡️ Zero theft or vandalism under squirrel protection")
        
    elif choice == 1:
        print("🕵️ Anti-squirrel task force vs. tiny organized crime")
        print("   🎪 Absurd warfare becomes documentary subject")
        state.budget -= 30000
        state.reputation += 0.1  # Entertainment value
        
    elif choice == 2:
        print("☮️ Historic peace accord signed with tiny paw prints")
        print("   🤝 Squirrels become forest monitoring partners")
        state.biodiversity_score += 0.1
        
    else:
        print("⚔️ All-out war against squirrel organized crime")
        print("   🥜 Squirrels retaliate by stealing all your nuts and bolts")
        state.budget -= 60000


def _crypto_forest_mining(state: GameState):
    """Cryptocurrency miners want to use forest for tree-coin mining."""
    print("₿ CRYPTO BOOM: Blockchain enthusiasts propose 'TreeCoin' mining in your forest!")
    print("   💻 Each tree becomes a node in decentralized network")
    print("   🌿 Claims to be 'most organic cryptocurrency ever'")
    
    investment = 150000
    options = [
        f"Partner with TreeCoin mining operation ({format_currency(investment)})",
        "Start your own competing 'LogCoin' cryptocurrency",
        "Refuse all crypto mining in forest",
        "Demand payment in actual cryptocurrency"
    ]
    
    choice = ask("How do you respond to crypto foresters?", options)
    
    if choice == 0:
        state.budget -= investment
        if random.random() < 0.6:  # 60% chance of success
            profit = random.randint(300000, 800000)
            print(f"🚀 TreeCoin goes to the moon! Profit: {format_currency(profit)}")
            state.budget += profit
        else:
            print("📉 TreeCoin crashes when people realize trees don't actually mine crypto")
            print("   💸 Total loss of investment")
            
    elif choice == 1:
        print("🚀 LogCoin launch: 'Proof of Photosynthesis' consensus algorithm")
        print("   💰 Early adopter advantage in forestry cryptocurrency")
        state.budget += 200000
        state.reputation += 0.15
        
    elif choice == 2:
        print("🚫 Forest remains crypto-free zone")
        print("   📰 Environmental groups praise 'anti-digital pollution' stance")
        state.reputation += 0.1
        
    else:
        print("₿ Crypto miners pay in Bitcoin, Ethereum, and DogeCoin")
        print("   🎢 Portfolio subject to extreme cryptocurrency volatility")
        state.budget += random.randint(-50000, 300000)


def _unicorn_sanctuary(state: GameState):
    """Unicorns want to establish sanctuary in the forest."""
    print("🦄 MAGICAL DISCOVERY: Unicorn herd requests sanctuary in your forest!")
    print("   ✨ They promise to make trees grow twice as fast with magic")
    
    options = [
        "Establish certified unicorn sanctuary ($100,000)",
        "Charge admission for unicorn viewing",
        "Politely decline magical assistance",
        "Try to capture unicorns for research"
    ]
    
    choice = ask("How do you handle unicorn negotiations?", options)
    
    if choice == 0:
        state.budget -= 100000
        print("🌟 Unicorn sanctuary established! Forest productivity magical")
        print("   📈 All harvest blocks grow 50% faster")
        state.survival_bonus += 0.25
        state.reputation += 0.3
    elif choice == 1:
        print("🎪 'Mystical Forest Tours' become world-famous attraction")
        state.budget += 200000
        state.reputation += 0.2
    elif choice == 2:
        print("🦄 Unicorns respect your honesty and bless the forest anyway")
        state.biodiversity_score += 0.1
    else:
        print("⚡ Unicorns curse your chainsaws to only cut in circles")
        state.budget -= 75000


def _zombie_apocalypse_drill(state: GameState):
    """Government zombie apocalypse preparedness drill."""
    print("🧟 EMERGENCY DRILL: Government conducts zombie apocalypse preparedness!")
    print("   🚁 Your forest designated as 'Zombie-Free Safe Zone'")
    
    options = [
        "Participate in drill and build zombie defenses",
        "Offer forest as zombie movie filming location", 
        "Ignore drill (it's probably not real...)",
        "Start zombie survival training for employees"
    ]
    
    choice = ask("How do you respond to zombie preparedness?", options)
    
    if choice == 0:
        print("🛡️ Excellent zombie defenses built around forest perimeter")
        print("   🏆 Government awards 'Zombie Readiness Excellence' certification")
        state.budget -= 50000
        state.reputation += 0.15
    elif choice == 1:
        print("🎬 Hollywood pays premium for 'authentic zombie forest' scenes")
        state.budget += 150000
    elif choice == 2:
        print("🧟 Plot twist: The drill was real. Zombie loggers attack equipment")
        state.budget -= 80000
    else:
        print("💪 Employees become incredibly fit from zombie training")
        print("   📊 Productivity increases from enhanced physical fitness")
        state.jobs_created += 10


def _bigfoot_job_application(state: GameState):
    """Bigfoot applies for employment."""
    print("👣 EMPLOYMENT INQUIRY: Bigfoot submits professional job application!")
    print("   📋 Claims 500 years experience in 'sustainable forest management'")
    print("   🎓 References include: Mother Nature, The Old Growth Council")
    
    options = [
        "Hire Bigfoot as Senior Forest Consultant",
        "Offer internship program first",
        "Politely decline due to lack of documentation",
        "Challenge Bigfoot to forestry skills competition"
    ]
    
    choice = ask("How do you handle Bigfoot's job application?", options)
    
    if choice == 0:
        print("💼 Bigfoot becomes your most knowledgeable employee")
        print("   🌲 Ancient forest wisdom improves all operations")
        state.biodiversity_score += 0.2
        state.reputation += 0.25
        state.budget -= 60000  # Bigfoot demands premium salary
    elif choice == 1:
        print("📚 Bigfoot intern program huge success")
        print("   📰 'Progressive Forestry: Hiring the Cryptozoologically Diverse'")
        state.reputation += 0.15
    elif choice == 2:
        print("📄 Bigfoot sadly cannot provide government-issued ID")
        print("   😢 Missed opportunity for legendary forest management")
    else:
        print("🏆 Bigfoot wins forestry Olympics by huge margin")
        print("   🥇 Company reputation soars from association with champion")
        state.reputation += 0.3


def _quantum_forest_phase(state: GameState):
    """Forest enters quantum superposition."""
    print("⚛️ PHYSICS ANOMALY: Forest enters quantum superposition!")
    print("   🌀 Trees exist in multiple states simultaneously")
    print("   🔬 Scientists baffled by 'Schrödinger's Forest' phenomenon")
    
    options = [
        "Study quantum effects for scientific advancement",
        "Harvest quantum wood (exists and doesn't exist)",
        "Ignore quantum effects completely",
        "Sell quantum forest tours to physicists"
    ]
    
    choice = ask("How do you handle quantum forest management?", options)
    
    if choice == 0:
        print("🧪 Quantum forestry research breakthrough!")
        print("   📊 Nobel Prize committee takes interest in your work")
        state.reputation += 0.4
        state.budget += 300000
    elif choice == 1:
        print("🌲 Quantum wood simultaneously profitable and unprofitable")
        print("   💰 Schrödinger's Bank Account created")
        quantum_result = random.choice([500000, -200000])
        state.budget += quantum_result
        print(f"   Result: {quantum_result:+,}")
    elif choice == 2:
        print("🙈 Quantum effects collapse from lack of observation")
        print("   📈 Forest returns to normal, slightly improved")
        state.biodiversity_score += 0.05
    else:
        print("🎓 Physics professors pay premium for quantum field trips")
        state.budget += 125000
        state.reputation += 0.1


def _forest_reality_tv_show(state: GameState):
    """Reality TV show wants to film in your forest."""
    show_concepts = [
        ("🏝️ 'Survivor: Canadian Wilderness'", "Contestants compete in your forest", 80000),
        ("💕 'The Lumberjack Bachelor'", "Dating show among forest workers", 60000), 
        ("🎪 'Extreme Forest Makeover'", "Redesigning forest layouts for aesthetics", 100000),
        ("🔍 'Forest Forensics CSI'", "Crime show investigates tree murders", 90000),
        ("👑 'Keeping Up with the Kardashians: Logging Edition'", "Reality stars try forestry", 200000)
    ]
    
    show, description, payment = random.choice(show_concepts)
    print(f"📺 REALITY TV PROPOSAL: {show}")
    print(f"   🎬 {description}")
    print(f"   💰 Network offers {format_currency(payment)} for filming rights")
    
    options = [
        "Accept reality TV deal",
        "Negotiate for higher payment",
        "Demand creative control of show",
        "Decline and maintain privacy"
    ]
    
    choice = ask("How do you respond to reality TV proposal?", options)
    
    if choice == 0:
        state.budget += payment
        print("🎬 Filming begins! Your forest becomes famous")
        if random.random() < 0.7:  # 70% chance of positive outcome
            print("   📈 Show is hit! Tourism and reputation boost")
            state.reputation += 0.2
        else:
            print("   📉 Show portrays forestry negatively, reputation damage")
            state.reputation -= 0.1
            
    elif choice == 1:
        print("💰 Successful negotiation doubles payment!")
        state.budget += payment * 2
        
    elif choice == 2:
        print("🎭 You become executive producer of forestry reality TV")
        print("   📺 Show promotes responsible forest management")
        state.budget += payment
        state.reputation += 0.3
        
    else:
        print("🚫 Privacy maintained, no filming in forest")
        print("   📰 Environmental groups praise protection of natural spaces")