import { z } from "zod";

// E.164 phone format validation (7-16 digits, must start with +)
const phoneRegex = /^\+[1-9]\d{6,15}$/;

// Email validation with max 254 characters
const emailSchema = z
  .string({ required_error: "Email is required" })
  .min(1, "Email is required")
  .max(254, "Email must be 254 characters or less")
  .email("Invalid email format");

// Password validation (8-128 characters) - require lowercase, uppercase, number, and special character (aligns with frontend)
const passwordSchema = z
  .string({ required_error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be 128 characters or less")
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/, "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character");

// Phone validation (more flexible format, allows common separators)
const phoneSchema = z
  .string({ required_error: "Phone number is required" })
  .min(1, "Phone number is required")
  .regex(/^\+?[1-9]\d{6,15}$/, "Phone number must be a valid international format (e.g., +1234567890 or 1234567890)")
  .transform(val => {
    // Ensure it starts with + for E.164 compliance
    const cleaned = val.replace(/\s/g, ''); // Remove any spaces
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  });

// Name validation (trimmed, max 100 characters)
const nameSchema = z
  .string({ required_error: "Name is required" })
  .min(1, "Name is required")
  .max(100, "Name must be 100 characters or less")
  .refine(val => val.trim().length > 0, "Name is required")
  .transform(val => val.trim());

// Company name validation (trimmed, max 100 characters)
const companyNameSchema = z
  .string({ required_error: "Company name is required" })
  .min(1, "Company name is required")
  .max(100, "Company name must be 100 characters or less")
  .refine(val => val.trim().length > 0, "Company name is required")
  .transform(val => val.trim());

// Tier validation - only accept specific values
const tierSchema = z.enum(["basic", "pro", "enterprise"], {
  errorMap: () => ({ message: "Tier must be one of: basic, pro, enterprise" })
});

// Location validation - enum to match frontend expectations
const locationSchema = z.enum(["nigeria", "international"], {
  errorMap: () => ({ message: "Location must be either 'nigeria' or 'international'" })
});

// Main signup schema
export const SignupSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  companyName: companyNameSchema,
  password: passwordSchema,
  tier: tierSchema,
  location: locationSchema,
  // Optional bot-prevention token from client; allow it so strict schema doesn't reject
  recaptchaToken: z.string().min(1).optional()
}).strict();

// Login schema
export const LoginSchema = z.object({
  // Support login with either email or username to match client behavior and route logic
  // Keep password policy consistent with auth route (min 8)
}).or(
  z.object({
    email: emailSchema,
    password: z.string({ required_error: 'Password is required' }).min(8, "Password must be at least 8 characters"),
  })
).or(
  z.object({
    username: z.string({ required_error: 'Username is required' }).min(3, "Username must be at least 3 characters"),
    password: z.string({ required_error: 'Password is required' }).min(8, "Password must be at least 8 characters"),
  })
);

// Password reset schema
export const PasswordResetSchema = z.object({
  email: emailSchema
});

// Password reset confirm schema
export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: passwordSchema
});

// Change password schema
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema
});

// Profile update schema
export const ProfileUpdateSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema.optional(),
  companyName: companyNameSchema.optional(),
  location: locationSchema.optional()
});

// Export types
export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type PasswordResetInput = z.infer<typeof PasswordResetSchema>;
export type PasswordResetConfirmInput = z.infer<typeof PasswordResetConfirmSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;
