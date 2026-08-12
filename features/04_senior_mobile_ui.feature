Feature: Senior Accessibility & Navigation UI
  As a senior citizen or family member
  I want simple navigation via top-right profile avatar dropdown and zero bottom-bar clutter
  So that I can easily navigate between My Chest, Loved Ones, Safety Status, and Audit Logs

  Scenario: Top-right profile avatar dropdown menu navigation
    Given a user on the Virasat home dashboard
    When the user taps the top-right profile avatar "SB"
    Then a dropdown menu should expand displaying user identity "Sayan Bhattacharjee"
    And navigation options for "My Family Chest", "Loved Ones & Heirs", "Safety Status", and "Audit Security Log" should be visible

  Scenario: Authentication modal supports Google, Apple, and Email sign-in
    Given an unauthenticated or switching user
    When the auth modal is presented
    Then options for "Continue with Google", "Continue with Apple", and "Continue with Email" should be active
    And selecting Google sign-in should authenticate the session cleanly
