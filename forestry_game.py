#!/usr/bin/env python3
"""Simple wrapper script to launch the object-oriented forestry simulator."""

from game_engine import ForestryGame


def main():
    game = ForestryGame()
    game.start()
    game.play()


if __name__ == "__main__":
    main()
