#!/bin/bash
# Consume stdin passed by Antigravity lifecycle hook to avoid broken pipes
cat > /dev/null

# Play completion sound (macOS alert / sound)
if [ -f /System/Library/Sounds/Glass.aiff ]; then
  afplay /System/Library/Sounds/Glass.aiff 2>/dev/null
else
  osascript -e "beep" 2>/dev/null
fi

# Return valid Stop hook JSON response
echo "{}"
