Feature: Senior Accessibility & Drawer Navigation
  As a senior citizen or family member
  I want one clear menu that names every part of the app in plain English
  So that I can reach my notes, my Beneficiary and my settings without hunting

  Scenario: Slide-out drawer lists every destination
    Given a user on the Virasat notes screen
    When the user opens the main menu
    Then the drawer should list "My notes", "Safety check-in", "Beneficiary", and "Settings"
    And the drawer should also offer "Trusted Friends", "Backup", and "Inherited notes"
