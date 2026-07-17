import mongoose, { Schema } from 'mongoose'
import type { IUser } from './interface'

// Reference schema only — kept minimal on purpose. Auth/registration lives in
// the Vault Josh auth service; here we just need the collection to exist so
// `ObjectId ref User` populates resolve.
const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
)

export const User = mongoose.model<IUser>('User', UserSchema)
