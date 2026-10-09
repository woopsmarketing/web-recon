/**
 * The inquiry form's seven fields, in row order — shared by the server side (ContactPage reads
 * one label / placeholder / hint slot per field) and the client island (InquiryForm renders a
 * row per field). A plain module: a client module's exports would reach the server as references.
 */
export type Field = "name" | "phone" | "address" | "area" | "buildingType" | "budget" | "message";
export const FIELDS: readonly Field[] = ["name", "phone", "address", "area", "buildingType", "budget", "message"];
