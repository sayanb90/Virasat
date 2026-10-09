Feature: Localised Category Taxonomy
  As a user in India or anywhere else
  I want categories named in vocabulary I recognise
  So that I know what belongs where without guessing

  Scenario: The universal structure is the same in every market
    Given the taxonomy is resolved for "IN"
    And the taxonomy is resolved for "INTL"
    Then both markets should expose the same 8 category groups

  Scenario: India sees Indian retirement vocabulary
    Given the taxonomy is resolved for "IN"
    Then the subcategory "banks.retirement" should be labelled "Retirement and Provident Funds"
    And its guidance should mention "EPF"

  Scenario: International sees generic retirement vocabulary
    Given the taxonomy is resolved for "INTL"
    Then the subcategory "banks.retirement" should be labelled "Retirement Accounts"

  Scenario: India adds subcategories that have no international counterpart
    Given the taxonomy is resolved for "IN"
    Then the subcategory "banks.nominees" should exist
    And the subcategory "assets.locker" should exist

  Scenario: Switching country never orphans an existing note
    Given a note was filed under "banks.nominees" in India
    When the user switches their country to "INTL"
    Then the note should still describe its category as "Nominee Details"

  Scenario: Every subcategory carries plain-English guidance
    Given the taxonomy is resolved for "IN"
    Then every subcategory should have a non-empty guidance line
