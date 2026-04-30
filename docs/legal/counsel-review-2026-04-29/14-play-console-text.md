# Play Console — text to paste into the forms

This file contains the text strings to paste into Play Console fields during
submission. Each section has a heading matching the Play Console field label
so you can find the right form quickly.

---

## 1. Privacy Policy URL

**Field:** Play Console → App content → Privacy policy → Privacy policy URL

```
https://routes.defensivepedal.com/privacy
```

---

## 2. Account deletion — public web URL

**Field:** Play Console → App content → Account deletion →
"Web resource where users can request account deletion"

```
https://routes.defensivepedal.com/account-deletion
```

**Field:** "Steps users follow to delete their account"

```
1. Open the Defensive Pedal app on your phone.
2. Tap the profile icon in the bottom navigation.
3. Scroll to the Account section and tap "Delete account".
4. Type DELETE to confirm and tap the red button.

Alternative for users who no longer have access to the app: email
privacy@defensivepedal.com from the address associated with the account.
We verify ownership and complete deletion within 30 days as required
by GDPR Article 17.
```

**Field:** "Type of data deleted" — tick **Account**, **Other** (custom data:
trip history, GPS breadcrumbs, hazard reports, comments)

**Field:** "Type of data retained" — tick **Other**, with the description:

```
Anonymised aggregate community statistics (CO₂ totals per neighbourhood,
hazard density per area) are retained without your username after
deletion. Server access logs (IP and timestamp) are retained for up to
12 months for security audit purposes (legitimate interest under GDPR
Article 6(1)(f)) and then deleted automatically.
```

---

## 3. Foreground location permission — declaration

**Field:** Play Console → Policy → App content → Sensitive permissions and
APIs → Location permissions → "Why does your app need this permission?"

```
Defensive Pedal is a cycling navigation app. We use precise foreground
location (ACCESS_FINE_LOCATION and ACCESS_COARSE_LOCATION) to:

1. Compute safety-scored cycling routes from the user's current position
   to a chosen destination.
2. Provide turn-by-turn navigation while the user is riding.
3. Allow the user to report road hazards (potholes, glass, dangerous
   intersections) at their current location, for the benefit of other
   riders in the area.
4. Display nearby community-reported hazards on the live map.
5. Look up local weather and air-quality conditions relevant to the ride.

Location data collected for navigation is processed in memory during the
ride and not transmitted off-device. A breadcrumb trail of completed
trips is stored on our EU servers for the user's trip history feature
and is automatically truncated after 90 days. Location data is never
sold, never used for advertising, and never shared with third parties
beyond the route-engine processors strictly necessary to provide the
service (Mapbox, OSRM, Open-Meteo).

Users can decline location access; in this case the app shows static
map content but cannot route or navigate.
```

---

## 4. Background location permission — declaration

**Field:** Play Console → Policy → App content → Sensitive permissions and
APIs → Location permissions → Background location → "Provide a justification"

```
Defensive Pedal requires background location (ACCESS_BACKGROUND_LOCATION)
exclusively to keep turn-by-turn cycling navigation working while the
phone screen is locked or while the user is using a different app
mid-ride.

Specific use case: a cyclist starts a navigation session, locks their
phone for safety while riding, and needs the app to continue:

1. Tracking the cyclist's position along the planned route.
2. Triggering audible turn-by-turn voice prompts at the right moment.
3. Detecting if the rider has gone off-route and recalculating.
4. Recording the trip's GPS breadcrumb trail for the user's history.

Without background location, the app cannot perform any of these
core navigation functions once the screen is off — which is the normal
state during a ride, both for safety (eyes on the road, not the phone)
and battery life.

User experience and transparency:
- Background location is requested as a separate permission AFTER
  foreground location, in line with Android 11+ requirements.
- A persistent foreground-service notification is shown the entire
  time background location is in use, with the active route name
  displayed, so the user knows location is being collected.
- Background location collection stops automatically when the user ends
  the trip (taps "End ride") or when the foreground service is
  terminated.
- The user can revoke background location at any time from system
  settings or the app's Privacy & analytics screen, and the app will
  fall back to foreground-only operation.

Data handling: GPS coordinates collected in the background are processed
identically to foreground GPS — used in-memory for routing and stored
as the breadcrumb trail of the completed trip. They are never used for
advertising, never sold, and are deleted on user request.

We have considered alternatives: a foreground-only navigation experience
would require the screen to be on continuously for the duration of the
ride, which is unsafe (rider attention) and impractical (battery). No
less-invasive alternative provides the safety-critical turn-by-turn
guidance this app exists to provide.
```

**Field:** "Is access to background location critical to your app's primary
functionality?" — **Yes**

**Field:** "Have you provided a prominent disclosure?" — **Yes** (we
disclose in onboarding and in the Privacy Policy that background location
is used during navigation).

---

## 5. Foreground services use — declaration

**Field:** Play Console → Policy → App content → Foreground services →
"Foreground service type"

Select: **Location**

**Field:** "Why does your app use a foreground service?"

```
Defensive Pedal uses a location foreground service exclusively for
turn-by-turn cycling navigation. The service is started when the user
explicitly begins a navigation session ("Start ride") and is stopped
when the user ends the ride or the destination is reached.

While the foreground service is running, a persistent notification is
displayed showing the active route, current speed, and an "End ride"
button. The user can stop the foreground service at any time from this
notification or from inside the app.

We do not use the foreground service for any other purpose (no
advertising, no analytics, no behaviour tracking, no cross-app
communication).
```

---

## 6. Data Safety form

The full Data Safety form mapping is in `13-play-store-minimum.md` § 5.
That table is what to enter in Play Console → App content → Data safety.

Key declarations to confirm:
- **Encryption in transit:** Yes
- **User can request data deletion:** Yes (in-app + web URL)
- **Independent security review:** No (you may leave unchecked at this
  scale)
- **Committed to Play Families Policy:** No (target audience is 16+, not
  children)

---

## 7. Target audience and content

**Field:** Play Console → Policy → App content → Target audience and content
→ "Target age group"

Select: **18 and over** (cleanest option) **OR** **16-17, 18 and over**
(if you want to allow 16-17-year-olds in line with your Terms § 2).

If you select 16-17 inclusive, you will be asked additional questions
about safeguards. The simplest answer: the app does not contain content
that is inappropriate for 16-17-year-olds, does not collect data beyond
what is disclosed in the Privacy Policy, and does not contain ads.

If unsure, select 18 and over for closed test; you can broaden later.

---

## 8. App access — closed test only

**Field:** Play Console → App access → "All or some functionality is
restricted"

Since closed test users have full access, you can answer:

```
All app functionality is available to closed-test users. No login or
geographic restrictions apply during the closed test.
```

If you want reviewers to use a specific test account, provide credentials
in the "Instructions" field. Otherwise, mark "Login not required" if
anonymous use is supported (it is).

---

## 9. App category

**Field:** Play Console → Store listing → Category

Recommended: **Health & Fitness** (primary), **Maps & Navigation**
(secondary if available, otherwise leave only the primary).

Cycling navigation apps (Komoot, Strava, Bikemap) typically list under
Health & Fitness because the discovery surface for fitness users is
larger and the category fits an exercise-oriented use case better than
pure Maps & Navigation.

---

## 10. Tags

Recommended tags (Play Console allows up to 5):
- Cycling
- Navigation
- Outdoor recreation
- Maps
- Routes

---

## 11. Content rating — IARC questionnaire

This must be submitted via Play Console's IARC flow. Quick answers for
Defensive Pedal:

- **Violence:** None
- **Sex / nudity:** None
- **Profanity / crude humour:** None (the app filters these in user-
  generated content)
- **Drugs / alcohol / tobacco:** None
- **Gambling:** None
- **Horror / fear:** None
- **User-generated content:** Yes, with moderation (comments, hazard
  reports, ride shares — auto-filtered + user-report flow + 24-hour
  illegal-content SLA)
- **Shares user location:** Yes (with other users via opt-in shared rides
  and hazard reports)
- **Personal information shared with users:** Username (display name)
  only, no email/phone

This typically results in a **PEGI 3 / ESRB Everyone** rating.

---

*End of Play Console text. Everything else is checkbox/dropdown selection.*
