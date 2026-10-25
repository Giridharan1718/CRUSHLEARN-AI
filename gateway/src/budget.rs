//! Per-session token budget.
//!
//! The gateway keeps a running total of tokens spent per session id. When a
//! session reaches its budget the gateway refuses further calls instead of
//! letting a runaway loop spend without limit. The budget is in the process
//! only, so a restart resets it.

use std::collections::HashMap;
use std::sync::Mutex;

/// Tracks token spend per session.
pub struct BudgetTracker {
    inner: Mutex<HashMap<String, u64>>,
    session_budget: u64,
}

impl BudgetTracker {
    pub fn new(session_budget: u64) -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
            session_budget,
        }
    }

    /// Adds tokens to a session and returns the new total.
    pub fn charge(&self, session_id: &str, tokens: u64) -> u64 {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        let entry = sessions.entry(session_id.to_string()).or_insert(0);
        *entry = entry.saturating_add(tokens);
        *entry
    }

    /// The tokens already spent in a session.
    pub fn spent(&self, session_id: &str) -> u64 {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        sessions.get(session_id).copied().unwrap_or(0)
    }

    /// True when the session has reached or passed its budget.
    pub fn exceeded(&self, session_id: &str) -> bool {
        self.spent(session_id) >= self.session_budget
    }

    /// The budget for one session.
    pub fn budget(&self) -> u64 {
        self.session_budget
    }

    /// Forgets a session. Called when a notebook is closed.
    pub fn reset(&self, session_id: &str) {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        sessions.remove(session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn charging_accumulates_tokens() {
        let tracker = BudgetTracker::new(1000);
        assert_eq!(tracker.charge("a", 100), 100);
        assert_eq!(tracker.charge("a", 250), 350);
        assert_eq!(tracker.spent("a"), 350);
    }

    #[test]
    fn sessions_are_tracked_separately() {
        let tracker = BudgetTracker::new(1000);
        tracker.charge("a", 900);
        assert_eq!(tracker.spent("b"), 0);
        assert!(!tracker.exceeded("b"));
    }

    #[test]
    fn a_session_reaches_its_budget() {
        let tracker = BudgetTracker::new(1000);
        tracker.charge("a", 1000);
        assert!(tracker.exceeded("a"));
    }

    #[test]
    fn resetting_a_session_clears_it() {
        let tracker = BudgetTracker::new(1000);
        tracker.charge("a", 1000);
        tracker.reset("a");
        assert_eq!(tracker.spent("a"), 0);
        assert!(!tracker.exceeded("a"));
    }
}
