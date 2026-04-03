# Habit Engine — Phone Testing Checklist

## 1. Onboarding Flow

- [ ] **Fresh install**: Clear app data → open app → onboarding starts automatically (no login required)
- [ ] **Location permission**: Screen shows "See how safe your streets are" → tap "Enable Location" → OS permission dialog appears
- [ ] **Safety score map**: Map shows colored risk segments (green/yellow/orange/red) after ~3 seconds
- [ ] **Safety score card**: Bottom card shows score/100 + 4 categories (safe, average, risky, v.risky)
- [ ] **Score color**: Green if 50+, yellow if 30-49, red if below 30
- [ ] **Map interaction**: Can zoom and pan the map without triggering navigation
- [ ] **Continue**: Tap card → advances to goal selection
- [ ] **Goal selection**: 3 cards (Commute / Explore / Beginner) → tap one → advances
- [ ] **Back navigation**: Back arrow on goal selection, first route, and signup screens
- [ ] **No bounce-back**: After selecting goal, stays on first-route screen (doesn't bounce back to goal selection)
- [ ] **Circuit route**: Shows "Safe route to [Name] and back" with a route on the map
- [ ] **Route stats**: Distance, duration, and safety score shown in card below map
- [ ] **Impact preview**: CO2 saved, money saved, hazards on route shown below route card
- [ ] **Signup prompt**: Progress bar at ~40%, Google sign-in button, "Skip for now" option
- [ ] **Skip signup**: Tap "Maybe later" → goes to route preview showing the onboarding route
- [ ] **Route preview**: Same circuit route from onboarding is displayed, can start navigation

## 2. Multi-Stop Routes

- [ ] **Add stop button**: On route planning screen, "Add stop" link appears below destination
- [ ] **Search stop**: Tap "Add stop" → search bar with autocomplete appears
- [ ] **Select stop**: Pick a result → yellow waypoint marker appears on map
- [ ] **Multiple stops**: Can add up to 3 intermediate stops
- [ ] **Remove stop**: Tap X next to a stop → stop removed, marker disappears
- [ ] **Route preview with stops**: Tap "Preview route" → route passes through all waypoints
- [ ] **Route line**: Route line visually goes through each waypoint (not straight to destination)

## 3. Post-Ride Impact Summary

- [ ] **Start a ride**: Navigate a route (even a short distance), then end the ride
- [ ] **Impact summary appears**: Before the star rating, a full-screen impact summary shows
- [ ] **3 animated counters**: CO2 saved, money saved, hazards warned — each animates with a staggered delay
- [ ] **Equivalent text**: Below counters, a relatable equivalent (e.g., "That's like planting 0.1 trees")
- [ ] **Lifetime totals**: Below counters, "Your total impact" section with running totals
- [ ] **Continue to rating**: Tap "Continue" → star rating form appears (existing flow preserved)
- [ ] **Star rating works**: Can select stars, type comment, submit
- [ ] **Anonymous signup prompt**: If not signed in, signup prompt appears after rating

## 4. Impact Dashboard

- [ ] **Access**: History tab → "Your Impact" button/link at top
- [ ] **Streak card**: Shows current streak number + chain of day links (golden for active, gray for missed)
- [ ] **Lifetime counters**: CO2 saved (with tree equivalent), money saved, riders protected
- [ ] **Guardian tier**: Shows current tier (Reporter) + progress to next tier (Watchdog at 5 reports)
- [ ] **This week summary**: Rides, km, CO2, hazards for current week
- [ ] **Pull to refresh**: Pull down → data refreshes
- [ ] **Loading state**: Shows skeleton/spinner while loading

## 5. Daily Safety Quiz

- [ ] **Access**: From Impact Dashboard, find quiz card/link
- [ ] **Question display**: Shows question text + 3-4 option buttons
- [ ] **Answer**: Tap an option → shows correct (green) or wrong (red) feedback
- [ ] **Explanation**: After answering, explanation text appears
- [ ] **Streak toast**: If streak was maintained, shows "Streak maintained!" toast
- [ ] **Done**: Tap "Done" → returns to previous screen
- [ ] **No repeat**: Coming back same day shows "No quiz available today" or same question

## 6. Enhanced Hazard Reporting

### During Navigation
- [ ] **FAB button**: Larger "Report" button visible during active navigation
- [ ] **2-tap flow**: Tap FAB → 6-type grid appears (Pothole, Construction, Dangerous Intersection, etc.)
- [ ] **Quick report**: Tap a hazard type → report filed immediately at current GPS location
- [ ] **Haptic feedback**: Feel a vibration on report submission
- [ ] **Toast**: "Reported! Other cyclists will be warned." appears briefly

### From Planning Map (Armchair Reporting)
- [ ] **Long press**: On route planning screen, long-press on the map → pin drops
- [ ] **Hazard picker**: Type picker appears at the pressed location
- [ ] **Report at pin**: Select type → hazard reported at the pin location (NOT user's GPS)

### Hazard Details
- [ ] **Tap hazard marker**: Tap an existing hazard marker on map → shows type + confirm/deny counts
- [ ] **Validation buttons**: "Still there?" with Yes/No if user hasn't voted on this hazard

## 7. Guardian Tier System

- [ ] **Profile section**: Profile screen shows "Guardian Status" section
- [ ] **Current tier**: Shows "Reporter" for new users
- [ ] **Progress**: Shows "Report X more hazards to reach Watchdog"
- [ ] **Feed badges**: On community feed, users with Watchdog+ tier show a badge next to their name
- [ ] **Tier progression**: After reporting 5 hazards, tier changes to "Watchdog" (may need to reload dashboard)

## 8. Community Stats

- [ ] **Community tab**: Shows "Cyclists in [City Name]" header
- [ ] **4 stat tiles**: Total trips, total distance, total ride time, total CO2 saved
- [ ] **Unique riders**: Shows number of active cyclists in the area

## 9. Streak System

- [ ] **Streak starts**: After completing any qualifying action (ride, quiz, hazard report), streak count goes to 1
- [ ] **Streak increments**: Next day, complete another action → streak goes to 2
- [ ] **Visual chain**: Impact Dashboard shows golden chain links for each active day
- [ ] **Freeze status**: Shows "Freeze available" or "Freeze used" in streak card (freeze earned at 3+ hazard reports/week)

## 10. Milestone Share Cards

- [ ] **Trigger**: After crossing a threshold (7-day streak, 50km ridden, 10 rides, etc.)
- [ ] **Modal**: "You hit a milestone!" modal appears with branded share card
- [ ] **Share**: Tap "Share" → native OS share sheet opens with achievement text
- [ ] **Dismiss**: Tap "Maybe later" → modal closes, won't re-trigger for same milestone

## 11. Sign In / Sign Out Flow

- [ ] **Sign in**: Google OAuth sign-in works from profile or signup prompt
- [ ] **Data preserved**: After signing in, streak/impact data from anonymous session is preserved
- [ ] **Sign out**: Profile → Sign Out → onboarding flow restarts
- [ ] **Re-sign-in**: After signing out, can sign in again and data is restored

## 12. Backward Compatibility

- [ ] **Existing users**: Users who were signed in before the habit engine update should NOT see onboarding
- [ ] **Existing features work**: Route planning → preview → navigation → feedback flow unchanged
- [ ] **Community feed**: Likes, loves, comments still work
- [ ] **Trip history**: Past trips still visible with CO2 data

---

## Notes

- **Streak 4AM cutoff**: A "day" for streak purposes resets at 4:00 AM local time, not midnight
- **Push notifications**: Server schedules them but they won't actually deliver until EAS project ID is configured and a native rebuild is done
- **Quiet hours**: Not enforced yet in notification triggers
- **Phase 7 features**: Mia persona journey, neighborhood challenges, Safety Wrapped, leaderboards, mentorship — all deferred
