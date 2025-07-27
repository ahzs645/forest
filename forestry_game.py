import random
from dataclasses import dataclass


def ask(prompt, options):
    """Prompt the user with numbered options and return the selected index."""
    while True:
        print("\n" + prompt)
        for i, opt in enumerate(options, 1):
            print(f"{i}. {opt}")
        choice = input('> ').strip()
        if choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(options):
                return idx
        print("Invalid choice, try again.")


@dataclass
class GameState:
    budget: int = 750000
    reputation: float = 0.5
    survival_bonus: float = 0.0
    permit_bonus: float = 0.0
    region: str = ""
    species: str = ""
    prep: int = 0
    training: int = 0


def choose_region(state: GameState):
    idx = ask("Where will you operate?", [
        "Sub-Boreal Spruce (SBS)",
        "Interior Douglas-fir (IDF)",
        "Montane Spruce (MS)"
    ])
    state.region = ["SBS", "IDF", "MS"][idx]


def forest_stewardship_plan(state: GameState):
    idx = ask(
        "How detailed will your Forest Stewardship Plan be?",
        [
            "Minimal plan (cheaper, less commitment)",
            "Comprehensive plan with ecosystem commitments",
        ],
    )
    if idx == 0:
        state.budget -= 10000
        state.reputation -= 0.1
    else:
        state.budget -= 30000
        state.reputation += 0.1
        state.permit_bonus += 0.05


def consult_first_nations(state: GameState):
    idx = ask(
        "Engage in early consultation with affected First Nations?",
        ["Yes", "No"],
    )
    if idx == 0:
        state.budget -= 8000
        state.reputation += 0.2
        state.permit_bonus += 0.1
    else:
        state.reputation -= 0.2


def manage_old_growth(state: GameState):
    idx = ask(
        "Old-growth management approach?",
        ["Respect deferral areas", "Request exemptions to harvest old growth"],
    )
    if idx == 0:
        state.reputation += 0.1
        state.permit_bonus += 0.05
    else:
        state.reputation -= 0.2


def vegetation_control(state: GameState):
    idx = ask(
        "Vegetation control method?",
        ["Glyphosate spray", "Mechanical brushing", "No control"],
    )
    if idx == 0:
        state.budget -= 20000
        state.reputation -= 0.1
        state.survival_bonus += 0.15
    elif idx == 1:
        state.budget -= 30000
        state.reputation += 0.05
        state.survival_bonus += 0.1


def wildfire_resilience(state: GameState):
    idx = ask(
        "Wildfire resilience actions?",
        ["None", "Fuel management and prescribed fire"],
    )
    if idx == 1:
        state.budget -= 15000
        state.reputation += 0.05
        state.survival_bonus += 0.05


def heritage_assessment(state: GameState):
    idx = ask(
        "Archaeological assessments under the Heritage Conservation Act?",
        ["Minimal survey", "Full assessment"],
    )
    if idx == 0:
        state.budget -= 5000
        state.reputation -= 0.05
        state.permit_bonus -= 0.1
    else:
        state.budget -= 15000
        state.reputation += 0.05
        state.permit_bonus += 0.05


def weather_planning(state: GameState):
    idx = ask("Planning for weather delays?", ["Minimal", "Moderate", "Thorough"])
    state.budget -= [0, 5000, 10000][idx]
    state.survival_bonus += [0.0, 0.05, 0.1][idx]


def select_species(state: GameState):
    idx = ask("What tree species will you plant?", ["Spruce", "Pine", "Mixed"])
    bonuses = [0.05, 0.03, 0.04]
    state.species = ["Spruce", "Pine", "Mixed"][idx]
    state.survival_bonus += bonuses[idx]


def site_preparation(state: GameState):
    idx = ask(
        "Site preparation method?",
        ["None", "Mounding", "Disc trenching"],
    )
    state.prep = idx
    if idx == 1:
        state.budget -= 12000
        state.survival_bonus += 0.05
    elif idx == 2:
        state.budget -= 8000
        state.survival_bonus += 0.03


def crew_training(state: GameState):
    idx = ask(
        "Training level for planting crews?",
        ["Basic orientation", "Comprehensive training"],
    )
    state.training = idx
    if idx == 1:
        state.budget -= 5000
        state.survival_bonus += 0.02


def apply_for_permit(state: GameState) -> bool:
    approval = 0.5 + state.permit_bonus + (state.reputation - 0.5) * 0.5
    return random.random() < approval


def plant_seedlings(state: GameState):
    survival = 0.6 + state.survival_bonus
    weather_event = random.random()
    if weather_event < 0.1:
        print("Severe weather ruined planting schedules!")
        survival -= 0.3
    elif weather_event < 0.3:
        print("Bad weather reduced survival rates.")
        survival -= 0.1
    else:
        print("Weather was favorable this season.")
    survival = max(0, min(1, survival))
    survived = int(20000 * survival)
    state.budget -= 20000 * 0.5
    print(f"\n{survived} of 20,000 {state.species} seedlings survived.")


def play_game():
    print("Welcome to the BC Forestry Adventure!\n")
    _ = input("Name your forestry company: ")  # company not used further
    state = GameState()

    choose_region(state)
    forest_stewardship_plan(state)
    consult_first_nations(state)
    manage_old_growth(state)
    vegetation_control(state)
    wildfire_resilience(state)
    heritage_assessment(state)
    weather_planning(state)
    select_species(state)
    site_preparation(state)
    crew_training(state)

    print("\nSubmitting permit application...")
    if not apply_for_permit(state):
        print("Permit denied. Without approval you cannot proceed. Game over.")
        return

    print("Permit approved! Time to plant 20,000 saplings.")
    plant_seedlings(state)
    print(f"Final budget: ${state.budget:,.0f}")
    print(f"Reputation score: {state.reputation:.2f}")
    print("Thanks for playing!")


if __name__ == "__main__":
    play_game()
