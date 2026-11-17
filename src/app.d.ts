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
		}
		interface Error {
			message: string;
		}
	}
}

export {};
