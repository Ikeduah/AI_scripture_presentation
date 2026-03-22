import { invoke } from "@tauri-apps/api/core";
import type { ScheduleItem, TimerState } from "@/lib/types/propresenter";

export interface ScheduleUpdatePayload {
  schedule: ScheduleItem[];
  currentSessionIndex: number | null;
}

/**
 * Update the schedule on the server for remote viewing
 */
export async function updateSchedule(
  schedule: ScheduleItem[],
  currentSessionIndex: number | null
): Promise<void> {
  try {
    // Convert ScheduleItem to match Rust structure
    const rustSchedule = schedule.map((item) => ({
      id: item.id,
      session: item.session,
      start_time: item.startTime,
      end_time: item.endTime,
      duration: item.duration,
      minister: item.minister,
    }));

    await invoke("update_schedule", {
      schedule: rustSchedule,
      currentSessionIndex: currentSessionIndex !== null ? currentSessionIndex : undefined,
    });
  } catch (error) {
    console.error("Failed to update schedule on server:", error);
    // Don't throw - this is a non-critical feature
  }
}

/**
 * Update the timer state on the server for remote viewing
 */
export async function updateTimerState(timerState: TimerState): Promise<void> {
  try {
    console.log("Updating timer state on server:", timerState);
    await invoke("update_timer_state", {
      // Tauri command args are camelCased on the JS side
      isRunning: timerState.isRunning,
      timeLeft: timerState.timeLeft,
      sessionName: timerState.sessionName || undefined,
      endTime: timerState.endTime || undefined,
      isOverrun: timerState.isOverrun || false,
    });
  } catch (error) {
    console.error("Failed to update timer state on server:", error);
    // Don't throw - this is a non-critical feature
  }
}
