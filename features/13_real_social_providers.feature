Feature: Signing in with Apple, Google and Facebook, checked by our server
  As an Owner who would rather not remember another password for sign-in
  I want to continue with Apple, Google or Facebook
  And I want our server, not the app, to decide whether to believe the provider

  # lib/auth/providers/native.ts. Tokens here are real signed JWTs; only the
  # provider's key set is local, so nothing reaches Apple, Google or Facebook.

  Background:
    Given a fresh sign-in service
    And the server checks real Apple, Google and Facebook tokens

  Scenario: A new person continues with Apple, and the app passes on the name Apple gave it
    When a new person continues with Apple as "meera@privaterelay.appleid.com", and the app says she is "Meera Sharma"
    Then she is asked to sign up as "meera@privaterelay.appleid.com" named "Meera Sharma"
    And her email address does not need a code

  Scenario: Google's own name wins over anything the app says
    When a new person continues with Google as "meera@gmail.com" named "Meera S", and the app says she is "Someone Else"
    Then she is asked to sign up as "meera@gmail.com" named "Meera S"

  Scenario: A token issued to another app is refused
    When someone continues with a Google token issued to another app
    Then the sign-in is refused with status 401 because it "could not be confirmed"

  Scenario: A token taken from one sign-in cannot be used for another
    When someone continues with a Google token issued for a different sign-in
    Then the sign-in is refused with status 401 because it "was not issued for this sign-in"

  Scenario: The same token cannot be used twice
    When a new person continues with Google as "meera@gmail.com" named "Meera S", and the app says she is ""
    And the same token and nonce are sent again
    Then the sign-in is refused with status 400 because it "has expired"

  Scenario: An expired token is refused
    When someone continues with an Apple token that expired an hour ago
    Then the sign-in is refused with status 401 because it "has expired"

  Scenario: Facebook checks the access token with Facebook itself, and an address it gives still needs a code
    When a new person continues with a Facebook access token for "meera@example.com" named "Meera"
    Then she is asked to sign up as "meera@example.com" named "Meera"
    And her email address needs a code

  Scenario: A Facebook account with no email can still sign up
    When a new person continues with a Facebook access token with no email, named "Meera"
    Then she is asked to sign up with no email, named "Meera"

  Scenario: A provider the server is not set up for says so
    Given the server checks only Apple tokens
    When someone continues with a Google token issued to another app
    Then the sign-in is refused with status 401 because it "Google sign-in is not set up on this server"

  Scenario: With no provider set up, social sign-in is unavailable
    Given the server checks no provider's tokens
    When someone continues with a Google token issued to another app
    Then the sign-in is refused with status 503 because it "No sign-in provider is set up"
