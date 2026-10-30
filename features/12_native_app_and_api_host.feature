Feature: The app ships inside the phone, and the API lives on its own host
  As an Owner using the iOS or Android app
  I want the app to reach Virasat's server, and nothing else to reach it as me
  And I want every link and every screen to keep working inside the app

  # The app is a static export carried in the native bundle (next.config.ts);
  # /api runs on a separate host behind proxy.ts. docs/developmentPlan.md,
  # phases 2 and 3.

  # ── Who may call the API ──────────────────────────────────────────────

  Scenario Outline: The native app may call the API from its own origin
    When a request to "/api/auth/login" arrives from "<origin>"
    Then it is allowed for "<origin>"
    And the answer says it depends on the origin
    And no cookie or credential is allowed across origins

    Examples:
      | origin                |
      | capacitor://localhost |
      | https://localhost     |

  Scenario Outline: A website elsewhere cannot call the API as the Owner
    When a request to "/api/notes" arrives from "<origin>"
    Then it is refused
    And the answer says it depends on the origin

    Examples:
      | origin                          |
      | https://evil.example            |
      | capacitor://localhost.evil.test |
      | http://localhost                |

  Scenario: The test harness's origin is allowed only when configured
    Given the API host is configured to allow "http://127.0.0.1:3398"
    When a request to "/api/notes" arrives from "http://127.0.0.1:3398"
    Then it is allowed for "http://127.0.0.1:3398"

  # ── What the API host serves ──────────────────────────────────────────

  Scenario Outline: The API host does not serve the app's screens
    Given the API host is running on its own
    When a browser opens "<path>" on the API host
    Then the API host answers 404

    Examples:
      | path                   |
      | /                      |
      | /notes                 |
      | /settings              |
      | /notes/view?sub=a&id=b |

  Scenario Outline: The API host serves the pages an email links to
    Given the API host is running on its own
    When a browser opens "<path>" on the API host
    Then the page is served

    Examples:
      | path                                 |
      | /trusted-friends/accept?token=tok_1  |
      | /welcome/recover/cancel?token=tok_2  |

  Scenario: An invitation link shared from the app opens on the web host, not the phone
    Given the app's API host is "https://api.virasat.example"
    When the app builds the link for invitation "tok_abc"
    Then the link is "https://api.virasat.example/trusted-friends/accept?token=tok_abc"

  # ── Screens that survive the native shell ─────────────────────────────

  Scenario: Every screen's address survives a reload inside the native shell
    # Capacitor's local server treats a dotted last segment as a file name,
    # and subcategory ids are dotted ("banks.nominees").
    Then the address of every kind of screen has no dot in its path
    And every subcategory and note id comes back unchanged from its address

  Scenario: A full reload inside the shell starts again from the root
    When the shell reloads "/notes/view" in the native build
    Then the app goes to "/" before it starts
    When the shell loads "/" in the native build
    Then the app stays where it is

  Scenario: The native build cannot be made without an API host
    When the native app is built without an API host
    Then the build stops and says it needs one
