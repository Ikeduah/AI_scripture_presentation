/**
 * ProPresenter AI Service
 * 
 * Handles ProPresenter-specific actions triggered by the global AI assistant.
 * These are direct API calls to ProPresenter for controlling presentations,
 * stage displays, messages, timers, macros, looks, and more.
 */

import type { TriggerSlideParams, ChangeStageLayoutParams, DisplayMessageParams, DisplayWithAITemplateParams, SetProPresenterTimerParams, ClearLayerParams, ExecutedAction } from "@/lib/types/globalChat";
import {
  getEnabledConnections,
  triggerPresentationOnConnections,
  changeStageLayoutOnAllEnabled,
} from "./propresenterService";
import {
  getProPresenterAITemplateById,
  findTemplateByName,
  writeTextToFile,
} from "@/lib/utils/proPresenterAITemplates";
import type { ProPresenterConnection } from "@/lib/types/propresenter";

// ============================================
// Presentation Control
// ============================================

/**
 * Trigger a specific slide in a presentation
 */
export async function triggerSlide(params: TriggerSlideParams): Promise<ExecutedAction> {
  try {
    const result = await triggerPresentationOnConnections({
      presentationUuid: params.presentationUuid,
      slideIndex: params.slideIndex,
    });

    if (result.success > 0) {
      return {
        type: "propresenter",
        action: "triggerSlide",
        success: true,
        message: `Triggered slide ${params.slideIndex + 1} on ${result.success} connection(s)`,
      };
    }

    return {
      type: "propresenter",
      action: "triggerSlide",
      success: false,
      message: result.errors.length > 0 ? result.errors[0] : "No enabled connections",
    };
  } catch (error) {
    console.error("Error triggering slide:", error);
    return {
      type: "propresenter",
      action: "triggerSlide",
      success: false,
      message: error instanceof Error ? error.message : "Failed to trigger slide",
    };
  }
}

/**
 * Trigger next slide on active presentation
 * @param count - Number of times to trigger next slide (default: 1)
 */
export async function triggerNextSlide(count: number = 1): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "triggerNextSlide",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    const totalTriggers = Math.max(1, Math.min(count, 50)); // Limit to 50 max for safety
    
    for (let i = 0; i < totalTriggers; i++) {
      for (const conn of connections) {
        try {
          const response = await fetch(`${conn.apiUrl}/v1/presentation/active/next/trigger`);
          if (response.ok && i === totalTriggers - 1) successCount++;
        } catch (err) {
          console.error(`Failed to trigger next slide on ${conn.name}:`, err);
        }
      }
      // Small delay between triggers to ensure ProPresenter processes them
      if (i < totalTriggers - 1) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    return {
      type: "propresenter",
      action: "triggerNextSlide",
      success: successCount > 0,
      message: successCount > 0
        ? totalTriggers > 1 
          ? `Advanced ${totalTriggers} slides on ${successCount} connection(s)`
          : `Advanced to next slide on ${successCount} connection(s)`
        : "Failed to advance slide",
    };
  } catch (error) {
    console.error("Error triggering next slide:", error);
    return {
      type: "propresenter",
      action: "triggerNextSlide",
      success: false,
      message: error instanceof Error ? error.message : "Failed to trigger next slide",
    };
  }
}

/**
 * Trigger previous slide on active presentation
 * @param count - Number of times to trigger previous slide (default: 1)
 */
export async function triggerPreviousSlide(count: number = 1): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "triggerPreviousSlide",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    const totalTriggers = Math.max(1, Math.min(count, 50)); // Limit to 50 max for safety
    
    for (let i = 0; i < totalTriggers; i++) {
      for (const conn of connections) {
        try {
          const response = await fetch(`${conn.apiUrl}/v1/presentation/active/previous/trigger`);
          if (response.ok && i === totalTriggers - 1) successCount++;
        } catch (err) {
          console.error(`Failed to trigger previous slide on ${conn.name}:`, err);
        }
      }
      // Small delay between triggers to ensure ProPresenter processes them
      if (i < totalTriggers - 1) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    return {
      type: "propresenter",
      action: "triggerPreviousSlide",
      success: successCount > 0,
      message: successCount > 0
        ? totalTriggers > 1
          ? `Went back ${totalTriggers} slides on ${successCount} connection(s)`
          : `Went to previous slide on ${successCount} connection(s)`
        : "Failed to go to previous slide",
    };
  } catch (error) {
    console.error("Error triggering previous slide:", error);
    return {
      type: "propresenter",
      action: "triggerPreviousSlide",
      success: false,
      message: error instanceof Error ? error.message : "Failed to trigger previous slide",
    };
  }
}

// ============================================
// Stage Display Control
// ============================================

/**
 * Change stage layout
 */
export async function changeStageLayout(params: ChangeStageLayoutParams): Promise<ExecutedAction> {
  try {
    const result = await changeStageLayoutOnAllEnabled(params.screenIndex, params.layoutIndex);

    if (result.success > 0) {
      return {
        type: "propresenter",
        action: "changeStageLayout",
        success: true,
        message: `Changed stage layout on ${result.success} connection(s)`,
      };
    }

    return {
      type: "propresenter",
      action: "changeStageLayout",
      success: false,
      message: result.errors.length > 0 ? result.errors[0] : "Failed to change stage layout",
    };
  } catch (error) {
    console.error("Error changing stage layout:", error);
    return {
      type: "propresenter",
      action: "changeStageLayout",
      success: false,
      message: error instanceof Error ? error.message : "Failed to change stage layout",
    };
  }
}

// ============================================
// Message/Lower Third Control
// ============================================

/**
 * Display a message (lower third)
 */
export async function displayMessage(params: DisplayMessageParams): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "displayMessage",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    for (const conn of connections) {
      try {
        const url = `${conn.apiUrl}/v1/message/${params.messageId}/trigger`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: params.tokens ? JSON.stringify(params.tokens) : undefined,
        });
        if (response.ok) successCount++;
      } catch (err) {
        console.error(`Failed to display message on ${conn.name}:`, err);
      }
    }

    return {
      type: "propresenter",
      action: "displayMessage",
      success: successCount > 0,
      message: successCount > 0
        ? `Displayed message on ${successCount} connection(s)`
        : "Failed to display message",
    };
  } catch (error) {
    console.error("Error displaying message:", error);
    return {
      type: "propresenter",
      action: "displayMessage",
      success: false,
      message: error instanceof Error ? error.message : "Failed to display message",
    };
  }
}

/**
 * Clear a message
 */
export async function clearMessage(messageId: string): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "clearMessage",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    for (const conn of connections) {
      try {
        const response = await fetch(`${conn.apiUrl}/v1/message/${messageId}/clear`);
        if (response.ok) successCount++;
      } catch (err) {
        console.error(`Failed to clear message on ${conn.name}:`, err);
      }
    }

    return {
      type: "propresenter",
      action: "clearMessage",
      success: successCount > 0,
      message: successCount > 0
        ? `Cleared message on ${successCount} connection(s)`
        : "Failed to clear message",
    };
  } catch (error) {
    console.error("Error clearing message:", error);
    return {
      type: "propresenter",
      action: "clearMessage",
      success: false,
      message: error instanceof Error ? error.message : "Failed to clear message",
    };
  }
}

// ============================================
// AI Template Display
// ============================================

/**
 * Display content using a ProPresenter AI template
 * This writes text to multiple files (like regular templates) and triggers the corresponding presentation
 * Each line of content goes to a separate file: prefix_1.txt, prefix_2.txt, etc.
 */
export async function displayWithAITemplate(
  params: DisplayWithAITemplateParams
): Promise<ExecutedAction> {
  console.log(`[ProPresenter AI] displayWithAITemplate called with params:`, params);
  
  try {
    // Validate params
    if (!params) {
      console.error(`[ProPresenter AI] No params provided`);
      return {
        type: "propresenter",
        action: "displayWithAITemplate",
        success: false,
        message: "No parameters provided for displayWithAITemplate",
      };
    }
    
    if (!params.templateId) {
      console.error(`[ProPresenter AI] No templateId provided`);
      return {
        type: "propresenter",
        action: "displayWithAITemplate",
        success: false,
        message: "No template ID provided. Please specify which template to use.",
      };
    }
    
    if (!params.text) {
      console.error(`[ProPresenter AI] No text content provided`);
      return {
        type: "propresenter",
        action: "displayWithAITemplate",
        success: false,
        message: "No text content provided to display.",
      };
    }
    
    // Try to find template by ID first, then by name (AI often uses name instead of ID)
    let template = getProPresenterAITemplateById(params.templateId);
    if (!template) {
      // Fallback: try to find by name (case-insensitive partial match)
      template = findTemplateByName(params.templateId);
    }
    
    if (!template) {
      console.error(`[ProPresenter AI] Template not found. Searched for ID/name: "${params.templateId}"`);
      return {
        type: "propresenter",
        action: "displayWithAITemplate",
        success: false,
        message: `Template "${params.templateId}" not found. Available templates may need to be configured in Settings > AI Configuration > ProPresenter AI Templates.`,
      };
    }
    
    // Validate template has required fields (new folder-based approach)
    if (!template.outputPath || !template.outputFileNamePrefix) {
      console.error(`[ProPresenter AI] Template "${template.name}" is missing outputPath or outputFileNamePrefix`);
      return {
        type: "propresenter",
        action: "displayWithAITemplate",
        success: false,
        message: `Template "${template.name}" is missing the output folder path or file name prefix. Please edit the template in Settings.`,
      };
    }
    
    console.log(`[ProPresenter AI] Using template:`, {
      name: template.name,
      id: template.id,
      outputPath: template.outputPath,
      outputFileNamePrefix: template.outputFileNamePrefix,
      maxLines: template.maxLines,
      presentationUuid: template.presentationUuid,
      slideIndex: template.slideIndex
    });
    
    // Parse content into lines - split by newline, filter empty lines
    // Content can be text + optional reference on separate lines
    const contentParts: string[] = [];
    const textContent = params.text.trim();
    const lines = textContent.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    // Add text lines
    contentParts.push(...lines);
    
    // If there's a reference, add it as the last line
    if (params.reference && params.reference.trim()) {
      contentParts.push(params.reference.trim());
    }
    
    console.log(`[ProPresenter AI] Content parts to write:`, contentParts);

    // Ensure output path ends with a separator
    const basePath = template.outputPath.replace(/\/?$/, "/");
    const prefix = template.outputFileNamePrefix;
    const maxFiles = template.maxLines || 6;
    
    // Write content to files: prefix_1.txt, prefix_2.txt, etc.
    // Clear all files first (up to maxLines), then write content
    let writeSuccess = true;
    
    for (let i = 1; i <= maxFiles; i++) {
      const filePath = `${basePath}${prefix}${i}.txt`;
      const content = i <= contentParts.length ? contentParts[i - 1] : "";
      
      console.log(`[ProPresenter AI] Writing file ${i}:`, { filePath, content: content.substring(0, 50) });
      
      const success = await writeTextToFile(filePath, content);
      if (!success && i <= contentParts.length) {
        // Only fail if we couldn't write actual content
        writeSuccess = false;
        console.error(`[ProPresenter AI] Failed to write to file: ${filePath}`);
      }
    }

    if (!writeSuccess) {
      return {
        type: "propresenter",
        action: "displayWithAITemplate",
        success: false,
        message: `Failed to write content to files. Check file path permissions and ensure the folder exists: ${basePath}`,
      };
    }

    // Trigger the presentation slide (with activation clicks for animations)
    const activationClicks = template.activationClicks || 1;
    console.log(`[ProPresenter AI] Triggering presentation with ${activationClicks} click(s)`);
    
    const triggerResult = await triggerPresentationOnConnections(
      {
        presentationUuid: template.presentationUuid,
        slideIndex: template.slideIndex,
      },
      template.connectionIds,
      activationClicks,
      100 // 100ms delay between clicks
    );

    if (triggerResult.success > 0) {
      return {
        type: "propresenter",
        action: "displayWithAITemplate",
        success: true,
        message: `Displayed "${params.text.substring(0, 30)}..." using ${template.name} (${contentParts.length} file(s))`,
      };
    }

    return {
      type: "propresenter",
      action: "displayWithAITemplate",
      success: false,
      message: "Content written to files but failed to trigger presentation. Check ProPresenter connection.",
    };
  } catch (error) {
    console.error("Error displaying with AI template:", error);
    return {
      type: "propresenter",
      action: "displayWithAITemplate",
      success: false,
      message: error instanceof Error ? error.message : "Failed to display with AI template",
    };
  }
}

// ============================================
// Timer Control
// ============================================

/**
 * Control a ProPresenter timer
 */
export async function setProPresenterTimer(
  params: SetProPresenterTimerParams
): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "setProPresenterTimer",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    for (const conn of connections) {
      try {
        const url = `${conn.apiUrl}/v1/timer/${params.timerId}/${params.operation}`;
        const response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: params.duration ? JSON.stringify({ duration: params.duration }) : undefined,
        });
        if (response.ok) successCount++;
      } catch (err) {
        console.error(`Failed to control timer on ${conn.name}:`, err);
      }
    }

    return {
      type: "propresenter",
      action: "setProPresenterTimer",
      success: successCount > 0,
      message: successCount > 0
        ? `Timer ${params.operation} on ${successCount} connection(s)`
        : "Failed to control timer",
    };
  } catch (error) {
    console.error("Error controlling ProPresenter timer:", error);
    return {
      type: "propresenter",
      action: "setProPresenterTimer",
      success: false,
      message: error instanceof Error ? error.message : "Failed to control timer",
    };
  }
}

// ============================================
// Macro and Look Control
// ============================================

/**
 * Trigger a macro
 */
export async function triggerMacro(macroId: string): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "triggerMacro",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    for (const conn of connections) {
      try {
        const response = await fetch(`${conn.apiUrl}/v1/macro/${macroId}/trigger`);
        if (response.ok) successCount++;
      } catch (err) {
        console.error(`Failed to trigger macro on ${conn.name}:`, err);
      }
    }

    return {
      type: "propresenter",
      action: "triggerMacro",
      success: successCount > 0,
      message: successCount > 0
        ? `Triggered macro on ${successCount} connection(s)`
        : "Failed to trigger macro",
    };
  } catch (error) {
    console.error("Error triggering macro:", error);
    return {
      type: "propresenter",
      action: "triggerMacro",
      success: false,
      message: error instanceof Error ? error.message : "Failed to trigger macro",
    };
  }
}

/**
 * Trigger a look
 */
export async function triggerLook(lookId: string): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "triggerLook",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    for (const conn of connections) {
      try {
        const response = await fetch(`${conn.apiUrl}/v1/look/${lookId}/trigger`);
        if (response.ok) successCount++;
      } catch (err) {
        console.error(`Failed to trigger look on ${conn.name}:`, err);
      }
    }

    return {
      type: "propresenter",
      action: "triggerLook",
      success: successCount > 0,
      message: successCount > 0
        ? `Activated look on ${successCount} connection(s)`
        : "Failed to activate look",
    };
  } catch (error) {
    console.error("Error triggering look:", error);
    return {
      type: "propresenter",
      action: "triggerLook",
      success: false,
      message: error instanceof Error ? error.message : "Failed to trigger look",
    };
  }
}

// ============================================
// Clear Operations
// ============================================

/**
 * Clear a specific layer
 */
export async function clearLayer(params: ClearLayerParams): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "clearLayer",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    for (const conn of connections) {
      try {
        const response = await fetch(`${conn.apiUrl}/v1/clear/layer/${params.layer}`);
        if (response.ok) successCount++;
      } catch (err) {
        console.error(`Failed to clear layer on ${conn.name}:`, err);
      }
    }

    return {
      type: "propresenter",
      action: "clearLayer",
      success: successCount > 0,
      message: successCount > 0
        ? `Cleared ${params.layer} layer on ${successCount} connection(s)`
        : `Failed to clear ${params.layer} layer`,
    };
  } catch (error) {
    console.error("Error clearing layer:", error);
    return {
      type: "propresenter",
      action: "clearLayer",
      success: false,
      message: error instanceof Error ? error.message : "Failed to clear layer",
    };
  }
}

/**
 * Clear all layers
 */
export async function clearAll(): Promise<ExecutedAction> {
  try {
    const connections = getEnabledConnections();
    if (connections.length === 0) {
      return {
        type: "propresenter",
        action: "clearAll",
        success: false,
        message: "No ProPresenter connections enabled",
      };
    }

    let successCount = 0;
    for (const conn of connections) {
      try {
        // Clear all main layers
        const layers = ["slide", "media", "props", "announcements", "messages"];
        for (const layer of layers) {
          await fetch(`${conn.apiUrl}/v1/clear/layer/${layer}`);
        }
        successCount++;
      } catch (err) {
        console.error(`Failed to clear all on ${conn.name}:`, err);
      }
    }

    return {
      type: "propresenter",
      action: "clearAll",
      success: successCount > 0,
      message: successCount > 0
        ? `Cleared all layers on ${successCount} connection(s)`
        : "Failed to clear all layers",
    };
  } catch (error) {
    console.error("Error clearing all:", error);
    return {
      type: "propresenter",
      action: "clearAll",
      success: false,
      message: error instanceof Error ? error.message : "Failed to clear all",
    };
  }
}

// ============================================
// Information Retrieval
// ============================================

/**
 * Get list of available messages from ProPresenter
 */
export async function getMessages(connection: ProPresenterConnection): Promise<any[]> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/messages`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error("Failed to get messages:", error);
    return [];
  }
}

/**
 * Get list of available macros from ProPresenter
 */
export async function getMacros(connection: ProPresenterConnection): Promise<any[]> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/macros`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error("Failed to get macros:", error);
    return [];
  }
}

/**
 * Get list of available looks from ProPresenter
 */
export async function getLooks(connection: ProPresenterConnection): Promise<any[]> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/looks`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error("Failed to get looks:", error);
    return [];
  }
}

/**
 * Get list of available timers from ProPresenter
 */
export async function getTimers(connection: ProPresenterConnection): Promise<any[]> {
  try {
    const response = await fetch(`${connection.apiUrl}/v1/timers`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error("Failed to get timers:", error);
    return [];
  }
}
