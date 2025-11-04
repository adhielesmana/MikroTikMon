# Testing Alert Sound with Dummy Popup

## Quick Test Guide

I've added a **"Test Popup" button** in the Settings page that sends a real notification popup with sound, exactly as it would appear during an actual alert.

### How to Test:

1. **Go to Settings Page**
   - Click on "Settings" in the sidebar
   - Scroll down to the "Notification Preferences" section

2. **Enable Alert Sound**
   - Make sure the "Alert Sound" toggle is **ON** (enabled)

3. **Test the Sound Alone** (optional)
   - Click the **"Test Sound" button** (speaker icon)
   - You should hear a 3-second emergency buzzer
   - This tests ONLY the sound (no popup)

4. **Test the Full Notification with Popup + Sound**
   - Click the **"Test Popup" button** (bell icon)
   - A toast notification will appear saying "Test sent"
   - **Within 1 second**, you should see:
     - ✅ **Red popup notification** (destructive variant)
     - ✅ **3-second emergency buzzer sound** 🔊
   
   The popup will show:
   - **Title:** "🔔 Test Alert"
   - **Message:** "Test Router - ether1 (TEST PORT): This is a test notification to verify alert sound is working..."

### What You Should Experience:

**Sound Characteristics:**
- **Duration:** 3 seconds
- **Type:** Warbling emergency siren
- **Volume:** Loud (60% volume - designed to be unmissable)
- **Pattern:** Alternates between high and low pitch every 0.15 seconds

**Popup Characteristics:**
- **Color:** Red (destructive variant - same as real alerts)
- **Duration:** 10 seconds
- **Position:** Bottom-right corner (toast notification)
- **Auto-dismiss:** Yes, after 10 seconds

### Testing Scenarios:

#### Scenario 1: Sound Enabled (Default)
1. Click "Test Popup" button
2. **Expected:** Popup appears + Sound plays
3. **Result:** ✅ Both should work

#### Scenario 2: Sound Disabled
1. Toggle "Alert Sound" to OFF
2. Click "Test Popup" button
3. **Expected:** Popup appears, NO sound
4. **Result:** ✅ Only popup, silent

#### Scenario 3: Multiple Clicks
1. Click "Test Popup" button multiple times quickly
2. **Expected:** Multiple popups stack, each with sound
3. **Result:** ✅ Sound should play for each notification

### Troubleshooting:

#### Popup appears but NO sound?

**Check these:**
1. **Sound toggle** - Make sure it's ON in Settings
2. **Browser console** - Open DevTools (F12), check for errors:
   - Should see: `[AlertSound] Audio context resumed from suspended state`
   - Should see: `[AlertSound] Playing 3-second LOUD emergency buzzer alarm`
3. **System volume** - Ensure your computer/speakers aren't muted
4. **Browser tab** - Check if the tab is muted (speaker icon on tab)
5. **Browser permissions** - Some browsers require user interaction first

**If still no sound:**
- Click "Test Sound" button first (speaker icon) - this initializes the audio context
- Then try "Test Popup" button again

#### No popup appears?

**Check WebSocket connection:**
1. Open browser console (F12)
2. Look for: `[WebSocket] Connected` and `[WebSocket] Authentication successful`
3. If not connected, refresh the page

**Check network:**
1. Open Network tab in DevTools
2. Click "Test Popup" button
3. Look for POST to `/api/alerts/test-notification`
4. Should return 200 OK with JSON response

#### Sound is too quiet or distorted?

This is unusual - the sound is designed to be loud. If this happens:
1. Refresh the page to reset audio context
2. Check system audio mixer settings
3. Try different browser (Chrome/Firefox/Edge)

### Backend Logs:

When you click "Test Popup", you should see in the server logs:

```
[Test] Sent test notification to user super-admin-001 (adhielesmana)
```

This confirms the notification was broadcast via WebSocket.

### Browser Console Logs:

When the notification arrives, you should see:

```javascript
[WebSocket] Message received: {type: "notification", data: {...}}
[WebSocket] Displaying notification: {title: "🔔 Test Alert", ...}
[AlertSound] Audio context resumed from suspended state  // First time only
[AlertSound] Playing 3-second LOUD emergency buzzer alarm
```

### API Endpoint Details:

**Endpoint:** `POST /api/alerts/test-notification`

**Authentication:** Required (session cookie)

**Response:**
```json
{
  "success": true,
  "message": "Test notification sent. Check for popup and listen for sound!",
  "notification": {
    "title": "🔔 Test Alert",
    "routerName": "Test Router",
    "portName": "ether1",
    "portComment": "TEST PORT",
    "message": "This is a test notification..."
  }
}
```

### Comparison: Test Sound vs Test Popup

| Feature | Test Sound Button | Test Popup Button |
|---------|-------------------|-------------------|
| Sound | ✅ 3-second buzzer | ✅ 3-second buzzer |
| Popup | ❌ No popup | ✅ Red alert popup |
| WebSocket | ❌ Not used | ✅ Real WebSocket notification |
| Purpose | Test audio only | Test full alert experience |
| Use case | Verify sound works | Simulate real alert |

### Production Use:

This test endpoint is **safe for production** because:
- ✅ Only sends notification to the user who clicked it (not broadcast to all users)
- ✅ Requires authentication
- ✅ Does NOT create database alerts
- ✅ Does NOT trigger email notifications
- ✅ Marked clearly as "TEST" in the notification

**Best Practice:** Test this regularly to ensure:
1. WebSocket connection is working
2. Audio context is initialized
3. Notifications reach the correct user
4. Sound plays at expected volume

### Summary:

**Test Popup button = Full end-to-end test**
- Simulates exactly what happens during a real alert
- Tests WebSocket → Frontend → Sound chain
- Verifies both popup AND sound together
- Most comprehensive test available

**Use this to verify:**
- ✅ Your notification system is working
- ✅ Sound alerts are functioning
- ✅ WebSocket is connected properly
- ✅ Browser permissions are granted

Click the **"Test Popup" button** now to verify everything works! 🎉
