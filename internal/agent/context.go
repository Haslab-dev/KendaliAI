package agent

// OptimizeContext fulfills Context Engine (Rule 6).
// Handles Token Explosion dynamically by deploying a sliding window and discarding internal reasoning step noise 
// if payloads grow too dense.
func OptimizeContext(messages []Message, maxRunes int) []Message {
	totalRunes := 0
	for _, m := range messages {
		totalRunes += len(m.Content)
	}

	if totalRunes <= maxRunes {
		return messages
	}

	// Strategy: Keep System Instructions (L1), 
	// Drop old intermediate tools and outputs (L2/L3), 
	// Preserve the most recent 3 conversational interactions.
	
	if len(messages) <= 4 { return messages }

	var optimized []Message
	// Always store System
	optimized = append(optimized, messages[0])
	
	// Keep ONLY the last 3 elements in the dialogue tail
	optimized = append(optimized, messages[len(messages)-3:]...)

	return optimized
}
