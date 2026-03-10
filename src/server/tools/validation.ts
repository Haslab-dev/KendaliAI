import { log } from "../core";
import { toolRegistry, ToolDefinition } from "./registry";

export interface ValidationError {
  field: string;
  message: string;
}

export class ToolValidator {
  /**
   * Validate tool parameters against schema
   */
  validate(toolName: string, params: Record<string, any>): ValidationError[] {
    const errors: ValidationError[] = [];

    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return [{ field: "tool", message: `Tool not found: ${toolName}` }];
    }

    const schema = tool.schema;
    if (!schema || Object.keys(schema).length === 0) {
      // No schema defined, accept any params
      return [];
    }

    // Validate each field in schema
    for (const [field, type] of Object.entries(schema)) {
      const value = params[field];
      const isRequired = !field.endsWith("?");
      const actualField = field.replace("?", "");

      if (value === undefined || value === null) {
        if (isRequired) {
          errors.push({
            field: actualField,
            message: `Required field '${actualField}' is missing`,
          });
        }
        continue;
      }

      // Type validation
      const typeError = this.validateType(actualField, value, type as string);
      if (typeError) {
        errors.push(typeError);
      }
    }

    return errors;
  }

  /**
   * Validate a single value against a type
   */
  private validateType(
    field: string,
    value: any,
    type: string,
  ): ValidationError | null {
    // Handle union types (e.g., "string | number")
    const types = type.split("|").map((t) => t.trim());

    for (const t of types) {
      if (this.checkType(value, t)) {
        return null; // Value matches at least one type
      }
    }

    return {
      field,
      message: `Expected type '${type}' but got '${typeof value}'`,
    };
  }

  /**
   * Check if value matches type
   */
  private checkType(value: any, type: string): boolean {
    switch (type.toLowerCase()) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && !isNaN(value);
      case "boolean":
        return typeof value === "boolean";
      case "array":
        return Array.isArray(value);
      case "object":
        return (
          typeof value === "object" && value !== null && !Array.isArray(value)
        );
      case "any":
        return true;
      default:
        // Check for array type (e.g., "string[]")
        if (type.endsWith("[]")) {
          if (!Array.isArray(value)) return false;
          const itemType = type.slice(0, -2);
          return value.every((item) => this.checkType(item, itemType));
        }
        return true;
    }
  }

  /**
   * Sanitize parameters - remove unknown fields and apply defaults
   */
  sanitize(toolName: string, params: Record<string, any>): Record<string, any> {
    const tool = toolRegistry.get(toolName);
    if (!tool || !tool.schema) {
      return params;
    }

    const sanitized: Record<string, any> = {};

    for (const [field, type] of Object.entries(tool.schema)) {
      const actualField = field.replace("?", "");
      const value = params[actualField];

      if (value !== undefined) {
        sanitized[actualField] = value;
      }
    }

    return sanitized;
  }

  /**
   * Validate and sanitize parameters
   */
  validateAndSanitize(
    toolName: string,
    params: Record<string, any>,
  ): {
    valid: boolean;
    errors: ValidationError[];
    params: Record<string, any>;
  } {
    const errors = this.validate(toolName, params);
    const sanitized =
      errors.length === 0 ? this.sanitize(toolName, params) : params;

    return {
      valid: errors.length === 0,
      errors,
      params: sanitized,
    };
  }
}

export const toolValidator = new ToolValidator();
