// Minimal User contract. In Vault Josh the user records are owned by the auth
// service — this API only needs enough of a schema to reference/populate them.
export interface IUser {
  name: string
  email: string
  passwordHash: string
}
