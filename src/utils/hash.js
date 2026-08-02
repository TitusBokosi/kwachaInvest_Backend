import bcrypt from "bcrypt"
import { SALT_ROUNDS } from "./constants.js"

export const hashValue = async (value) => bcrypt.hash(value, SALT_ROUNDS);

export const compareValue = async (value, hash) => bcrypt.compare(value, hash);
