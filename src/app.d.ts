declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				displayName: string;
				loginName: string;
			} | null;
			isAdmin: boolean;
			adminUsername: string | null;
			sessionHash: Buffer | null;
			stepUpUntil: Date | null;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
