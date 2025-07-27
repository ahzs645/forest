#!/usr/bin/env python3
"""High level game engine for the BC Interior Forestry Simulator."""

import random
from game_models import GameState
from utils import ask, print_section_header, print_subsection, format_currency
from events import random_policy_events, market_fluctuations
from permits import process_permits
from first_nations import ongoing_first_nations_consultation
from certification import maintain_certifications
from illegal_activities_enhanced import ongoing_criminal_consequences
from wacky_events import quarterly_wacky_events
from liaison import liaison_management
from ceo_system import (
    ceo_automated_decisions,
    pay_ceo_annual_costs,
    ceo_quarterly_report,
)
from first_nations_anger import random_first_nations_anger_events, check_anger_event_triggers
from workplace_safety import workplace_safety_incidents, ongoing_safety_consequences
from forestry_game_modular import (
    ENABLE_WACKY_EVENTS,
    choose_region,
    initial_setup,
    plan_harvest_schedule,
    conduct_harvest_operations,
    annual_management_decisions,
    quarter_end_summary,
    check_win_conditions,
    advance_quarter,
)


class ForestryGame:
    """Object-oriented wrapper around the modular game logic."""

    def __init__(self, company_name: str = "Northern Forest Solutions"):
        self.company_name = company_name
        self.state = GameState()

    def start(self):
        """Run initial setup before the quarterly loop."""
        choose_region(self.state)
        initial_setup(self.state)
        print(f"\n{self.company_name} is now operational in the {self.state.region} region!")
        print(f"Starting budget: {format_currency(self.state.budget)}")
        print("🗓️  Game runs quarterly - make decisions every 3 months!")

    def play(self, quarters: int = 60):
        """Play the game for the given number of quarters."""
        quarter_count = 0
        while quarter_count < quarters:
            quarter_count += 1
            qnames = ["", "Q1 (Spring)", "Q2 (Summer)", "Q3 (Fall)", "Q4 (Winter)"]
            semojis = ["", "🌱", "☀️", "🍂", "❄️"]
            print_section_header(
                f"{self.company_name} - {semojis[self.state.quarter]} {qnames[self.state.quarter]}",
                self.state.year,
            )

            if self.state.quarter == 1:
                print("🌱 SPRING: Planning and permit season begins!")
                random_policy_events(self.state)
                ongoing_first_nations_consultation(self.state)
                plan_harvest_schedule(self.state)
            elif self.state.quarter == 2:
                print("☀️ SUMMER: Prime harvesting season!")
                process_permits(self.state)
                conduct_harvest_operations(self.state)
            elif self.state.quarter == 3:
                print("🍂 FALL: Harvest continues, winter prep begins!")
                process_permits(self.state)
                conduct_harvest_operations(self.state)
            else:
                print("❄️ WINTER: Planning season, limited field operations!")
                maintain_certifications(self.state)
                market_fluctuations(self.state)
                if getattr(self.state, "fn_liaison", None):
                    liaison_cost = self.state.fn_liaison.cost
                    if self.state.budget >= liaison_cost:
                        self.state.budget -= liaison_cost
                        print(
                            f"💰 Annual liaison fee: {format_currency(liaison_cost)} paid to {self.state.fn_liaison.name}"
                        )
                    else:
                        print(
                            f"❌ Cannot afford liaison fee! {self.state.fn_liaison.name} contract terminated"
                        )
                        self.state.fn_liaison = None
                pay_ceo_annual_costs(self.state)

            if ENABLE_WACKY_EVENTS:
                quarterly_wacky_events(self.state)

            workplace_safety_incidents(self.state)

            if check_anger_event_triggers(self.state) or random.random() < 0.25:
                random_first_nations_anger_events(self.state)

            ceo_actions = ceo_automated_decisions(self.state)
            if ceo_actions:
                print_subsection("CEO AUTOMATED ACTIONS")
                for action in ceo_actions:
                    print(f"👔 {action}")

            ongoing_criminal_consequences(self.state)
            ongoing_safety_consequences(self.state)
            annual_management_decisions(self.state)
            ceo_quarterly_report(self.state)

            quarter_end_summary(self.state)

            game_over, message = check_win_conditions(self.state)
            if game_over:
                print(f"\n🎯 {message}")
                break

            if self.state.quarter == 4 and quarter_count < quarters - 4:
                choice = ask(
                    f"Continue to {self.state.year + 1}?",
                    ["Yes", "No", "Play 1 more quarter only"],
                )
                if choice == 1:
                    print("You've decided to end operations. Thanks for playing!")
                    break
                elif choice == 2:
                    quarters = quarter_count + 1

            advance_quarter(self.state)

        print("\nThanks for playing the Enhanced BC Interior Forestry Simulator!")


if __name__ == "__main__":
    game = ForestryGame()
    game.start()
    game.play()
