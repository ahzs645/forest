"""
Utility Functions
Common helper functions for the BC Forestry Simulator
"""

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


def format_currency(amount: int) -> str:
    """Format currency with proper commas."""
    return f"${amount:,.0f}"


def format_volume(volume: int) -> str:
    """Format volume with proper commas."""
    return f"{volume:,} m³"


def calculate_relationship_text(level: float) -> str:
    """Convert relationship level to descriptive text."""
    if level >= 0.8:
        return "Excellent"
    elif level >= 0.6:
        return "Good"
    elif level >= 0.4:
        return "Neutral"
    elif level >= 0.2:
        return "Strained"
    else:
        return "Poor"


def print_section_header(title: str, year: int = None):
    """Print a formatted section header."""
    if year:
        header = f"YEAR {year} - {title}"
    else:
        header = title
    
    print(f"\n{'='*max(50, len(header))}")
    print(header)
    print(f"{'='*max(50, len(header))}")


def print_subsection(title: str):
    """Print a formatted subsection header."""
    print(f"\n=== {title} ===")