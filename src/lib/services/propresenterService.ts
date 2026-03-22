/**
 * ProPresenter API Service
 * 
 * This service provides infrastructure for all ProPresenter API integrations.
 * It supports multiple ProPresenter instances and can be used throughout the app
 * for timer control, slide triggering, and other ProPresenter operations.
 */

import type { ProPresenterConnection, ProPresenterTimerPayload, ProPresenterTimerResponse, ProPresenterVersionResponse, ProPresenterSlideIndexResponse, ProPresenterActivationConfig, ProPresenterStageScreen, ProPresenterStageLayout } from "@/lib/types/propresenter";

// Storage keys
const PROPRESENTER_CONNECTIONS_KEY = "proassist-propresenter-connections";

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Load ProPresenter connections from localStorage
 */
export function loadProPresenterConnections(): ProPresenterConnection[] {
  try {
    const stored = localStorage.getItem(PROPRESENTER_CONNECTIONS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error("Failed to load ProPresenter connections:", err);
  }
  // Return default connection if none exist
  return [
    {
      id: generateUUID(),
      name: "ProPresenter 1",
      apiUrl: "http://localhost:1025",
      timerIndex: 0,
      isEnabled: false,
    },
  ];
}

/**
 * Save ProPresenter connections to localStorage
 */
export function saveProPresenterConnections(connections: ProPresenterConnection[]): void {
  try {
    localStorage.setItem(PROPRESENTER_CONNECTIONS_KEY, JSON.stringify(connections));
  } catch (err) {
    console.error("Failed to save ProPresenter connections:", err);
  }
}

/**
 * Get all enabled ProPresenter connections
 */
export function getEnabledConnections(): ProPresenterConnection[] {
  return loadProPresenterConnections().filter((conn) => conn.isEnabled);
}

/**
 * Test a ProPresenter connection
 */
export async function testConnection(connection: ProPresenterConnection): Promise<{
  success: boolean;
  message: string;
  data?: ProPresenterVersionResponse;
}> {
  try {
    const response = await fetch(`${connection.apiUrl}/version`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (response.ok) {
      const data: ProPresenterVersionResponse = await response.json();
      return {
        success: true,
        message: `Connected to ${data.name} (${data.host_description})`,
        data,
      };
    } else {
      return {
        success: false,
        message: `HTTP error: ${response.status}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Test a specific timer on a ProPresenter connection
 */
export async function testTimer(connection: ProPresenterConnection): Promise<{
  success: boolean;
  message: string;
  data?: ProPresenterTimerResponse;
}> {
  try {
    const response = await fetch(
      `${connection.apiUrl}/v1/timer/${connection.timerIndex}`,
      {
        method: "GET",
        headers: { "Accept": "application/json" },
      }
    );

    if (response.ok) {
      const data: ProPresenterTimerResponse = await response.json();
      return {
        success: true,
        message: `Connected to timer "${data.id.name}"`,
        data,
      };
    } else {
      return {
        success: false,
        message: `HTTP error: ${response.status}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Timer test failed",
    };
  }
}

/**
 * Calculate time of day in seconds for ProPresenter API
 */
export function calculateTimeOfDay(time: string): number {
  const [timeStr, period] = time.split(' ');
  let [hours, minutes] = timeStr.split(':').map(Number);

  // Convert to 24-hour format
  if (period?.toLowerCase() === 'pm' && hours !== 12) {
    hours += 12;
  } else if (period?.toLowerCase() === 'am' && hours === 12) {
    hours = 0;
  }

  return (hours * 3600) + (minutes * 60);
}

/**
 * Reset a timer on a ProPresenter instance
 */
export async function resetTimer(
  connection: ProPresenterConnection,
  payload: ProPresenterTimerPayload
): Promise<boolean> {
  try {
    const response = await fetch(
      `${connection.apiUrl}/v1/timer/${connection.timerIndex}/reset`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    return response.ok;
  } catch (error) {
    console.error(`Error resetting timer on ${connection.name}:`, error);
    return false;
  }
}

/**
 * Start a timer on a ProPresenter instance
 */
export async function startTimer(
  connection: ProPresenterConnection,
  payload: ProPresenterTimerPayload
): Promise<boolean> {
  try {
    const response = await fetch(
      `${connection.apiUrl}/v1/timer/${connection.timerIndex}/start`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    return response.ok;
  } catch (error) {
    console.error(`Error starting timer on ${connection.name}:`, error);
    return false;
  }
}

/**
 * Stop a timer on a ProPresenter instance
 */
export async function stopTimer(connection: ProPresenterConnection): Promise<boolean> {
  try {
    const response = await fetch(
      `${connection.apiUrl}/v1/timer/${connection.timerIndex}/stop`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.ok;
  } catch (error) {
    console.error(`Error stopping timer on ${connection.name}:`, error);
    return false;
  }
}

/**
 * Start timers on all enabled ProPresenter instances
 */
export async function startTimerOnAllEnabled(
  sessionName: string,
  duration?: number,
  endTime?: string
): Promise<{ success: number; failed: number; errors: string[] }> {
  const enabledConnections = getEnabledConnections();
  const results = { success: 0, failed: 0, errors: [] as string[] };

  if (enabledConnections.length === 0) {
    return results;
  }

  const promises = enabledConnections.map(async (connection) => {
    try {
      const payload: ProPresenterTimerPayload = {
        id: {
          name: sessionName,
          index: connection.timerIndex,
          uuid: generateUUID(),
        },
        allows_overrun: true,
      };

      if (duration !== undefined) {
        payload.countdown = { duration };
      } else if (endTime) {
        payload.count_down_to_time = {
          time_of_day: calculateTimeOfDay(endTime),
          period: endTime.split(" ")[1]?.toLowerCase() || "am",
        };
      }

      // Reset then start
      await resetTimer(connection, payload);
      const success = await startTimer(connection, payload);

      if (success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`Failed to start timer on ${connection.name}`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push(
        `Error on ${connection.name}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

  await Promise.allSettled(promises);
  return results;
}

/**
 * Stop timers on all enabled ProPresenter instances
 */
export async function stopTimerOnAllEnabled(): Promise<{ success: number; failed: number }> {
  const enabledConnections = getEnabledConnections();
  const results = { success: 0, failed: 0 };

  const promises = enabledConnections.map(async (connection) => {
    const success = await stopTimer(connection);
    if (success) {
      results.success++;
    } else {
      results.failed++;
    }
  });

  await Promise.allSettled(promises);
  return results;
}

// ============================================
// FUTURE PROPRESENTER API EXTENSIONS
// ============================================

/**
 * Trigger a specific slide in a presentation
 * This is a placeholder for future slide triggering functionality
 */
export async function triggerSlide(
  connection: ProPresenterConnection,
  presentationUUID: string,
  slideIndex: number
): Promise<boolean> {
  try {
    const response = await fetch(
      `${connection.apiUrl}/v1/presentation/${presentationUUID}/slide/${slideIndex}/trigger`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.ok;
  } catch (error) {
    console.error(`Error triggering slide on ${connection.name}:`, error);
    return false;
  }
}

/**
 * Get all presentations from a ProPresenter instance
 */
export async function getPresentations(
  connection: ProPresenterConnection
): Promise<any[]> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/presentations`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error(`Error getting presentations from ${connection.name}:`, error);
    return [];
  }
}

/**
 * Trigger the next slide on a ProPresenter instance
 */
export async function triggerNextSlide(connection: ProPresenterConnection): Promise<boolean> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/trigger/next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok;
  } catch (error) {
    console.error(`Error triggering next slide on ${connection.name}:`, error);
    return false;
  }
}

/**
 * Trigger the previous slide on a ProPresenter instance
 */
export async function triggerPreviousSlide(connection: ProPresenterConnection): Promise<boolean> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/trigger/previous`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok;
  } catch (error) {
    console.error(`Error triggering previous slide on ${connection.name}:`, error);
    return false;
  }
}

/**
 * Clear all layers on a ProPresenter instance
 */
export async function clearAll(connection: ProPresenterConnection): Promise<boolean> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok;
  } catch (error) {
    console.error(`Error clearing all on ${connection.name}:`, error);
    return false;
  }
}

/**
 * Get current stage display status
 */
export async function getStageStatus(connection: ProPresenterConnection): Promise<any> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/stage/display`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error(`Error getting stage status from ${connection.name}:`, error);
    return null;
  }
}

/**
 * Get current slide index from ProPresenter
 * This gets the currently active presentation and slide index
 */
export async function getCurrentSlideIndex(
  connection: ProPresenterConnection
): Promise<ProPresenterSlideIndexResponse | null> {
  try {
    const response = await fetch(
      `${connection.apiUrl}/v1/presentation/slide_index?chunked=false`,
      {
        method: "GET",
        headers: { "Accept": "application/json" },
      }
    );

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error(`Error getting current slide index from ${connection.name}:`, error);
    return null;
  }
}

/**
 * Trigger/activate a presentation slide in ProPresenter
 */
export async function triggerPresentationSlide(
  connection: ProPresenterConnection,
  config: ProPresenterActivationConfig
): Promise<boolean> {
  try {
    const response = await fetch(
      `${connection.apiUrl}/v1/presentation/${config.presentationUuid}/${config.slideIndex}/trigger`,
      {
        method: "GET",
        headers: { "Accept": "*/*" },
      }
    );
    return response.ok;
  } catch (error) {
    console.error(
      `Error triggering presentation slide on ${connection.name}:`,
      error
    );
    return false;
  }
}

/**
 * Trigger presentation activation on specific ProPresenter connections
 * @param config The activation configuration
 * @param connectionIds Optional array of connection IDs to trigger on. If empty or undefined, triggers on all enabled connections.
 * @param clickCount Number of times to trigger (default: 1). For animations, use multiple clicks.
 * @param delayBetweenClicks Delay in milliseconds between clicks (default: 100ms)
 */
export async function triggerPresentationOnConnections(
  config: ProPresenterActivationConfig,
  connectionIds?: string[],
  clickCount: number = 1,
  delayBetweenClicks: number = 100
): Promise<{ success: number; failed: number; errors: string[] }> {
  const allConnections = loadProPresenterConnections();
  let targetConnections: ProPresenterConnection[];

  if (connectionIds && connectionIds.length > 0) {
    // Filter to only the specified connections that are enabled
    targetConnections = allConnections.filter(
      (conn) => connectionIds.includes(conn.id) && conn.isEnabled
    );
  } else {
    // Default to all enabled connections
    targetConnections = getEnabledConnections();
  }

  const results = { success: 0, failed: 0, errors: [] as string[] };

  if (targetConnections.length === 0) {
    return results;
  }

  // Trigger multiple times if clickCount > 1
  for (let click = 0; click < clickCount; click++) {
    const promises = targetConnections.map(async (connection) => {
      try {
        const success = await triggerPresentationSlide(connection, config);
        if (success) {
          // Only count success on the first click to avoid inflating numbers
          if (click === 0) {
            results.success++;
          }
        } else {
          // Only count failures on the first click
          if (click === 0) {
            results.failed++;
            results.errors.push(`Failed to trigger presentation on ${connection.name}`);
          }
        }
      } catch (error) {
        // Only count errors on the first click
        if (click === 0) {
          results.failed++;
          results.errors.push(
            `Error on ${connection.name}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }
    });

    await Promise.allSettled(promises);
    
    // Add delay between clicks (except after the last one)
    if (click < clickCount - 1 && delayBetweenClicks > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenClicks));
    }
  }

  return results;
}

/**
 * Trigger presentation activation on all enabled ProPresenter instances
 * @deprecated Use triggerPresentationOnConnections instead for more control
 */
export async function triggerPresentationOnAllEnabled(
  config: ProPresenterActivationConfig
): Promise<{ success: number; failed: number; errors: string[] }> {
  return triggerPresentationOnConnections(config);
}

/**
 * Get all stage screens from a ProPresenter instance
 */
export async function getStageScreens(
  connection: ProPresenterConnection
): Promise<ProPresenterStageScreen[]> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/stage/screens?chunked=false`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error(`Error getting stage screens from ${connection.name}:`, error);
    return [];
  }
}

/**
 * Get all stage layouts from a ProPresenter instance
 */
export async function getStageLayouts(
  connection: ProPresenterConnection
): Promise<ProPresenterStageLayout[]> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/stage/layouts?chunked=false`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error(`Error getting stage layouts from ${connection.name}:`, error);
    return [];
  }
}

/**
 * Change the stage layout for a specific screen
 */
export async function changeStageLayout(
  connection: ProPresenterConnection,
  screenIndex: number,
  layoutIndex: number
): Promise<boolean> {
  try {
    const response = await fetch(
      `${connection.apiUrl}/v1/stage/screen/${screenIndex}/layout/${layoutIndex}`,
      {
        method: "GET",
        headers: { "Accept": "*/*" },
      }
    );
    return response.ok;
  } catch (error) {
    console.error(`Error changing stage layout on ${connection.name}:`, error);
    return false;
  }
}

/**
 * Change stage layout on all enabled ProPresenter instances
 */
export async function changeStageLayoutOnAllEnabled(
  screenIndex: number,
  layoutIndex: number
): Promise<{ success: number; failed: number; errors: string[] }> {
  const enabledConnections = getEnabledConnections();
  const results = { success: 0, failed: 0, errors: [] as string[] };

  if (enabledConnections.length === 0) {
    return results;
  }

  const promises = enabledConnections.map(async (connection) => {
    try {
      const success = await changeStageLayout(connection, screenIndex, layoutIndex);
      if (success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`Failed to change stage layout on ${connection.name}`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push(
        `Error on ${connection.name}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  });

  await Promise.allSettled(promises);
  return results;
}
