export class StatusError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
        this.name = 'StatusError';
    }
}