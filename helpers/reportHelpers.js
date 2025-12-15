import validator from 'validator';

const VALID_ISSUES = ['elevator', 'escalator', 'bathroom', 'turnstile', 'other'];
const VALID_STATUS = ['active', 'resolved'];
export const parseAndValidateStops = (stopsRaw) => {
    if(!stopsRaw)
        throw new Error('At least one stop must be selected');
    const items = Array.isArray(stopsRaw) ? stopsRaw : [stopsRaw];
    const stops = items.map((s) => {
        const parts = s.split('|');
        if(parts.length !== 3)
            throw new Error('Invalid stop format');
        const [stopId, stopName, transitSystem] = parts.map((p) => p.trim());
        if(!stopId || !stopName || !transitSystem)
            throw new Error('Invalid stop data');
        return { stopId, stopName, transitSystem };
    });
    if(!stops.length)
        throw new Error('At least one stop must be selected');
    return stops;
};

export const validateIssueType = (issueType) => {
    if(!VALID_ISSUES.includes(issueType)){
        throw new Error('Invalid issue type');
    }
    return issueType;
};

export const validateDescription = (description) => {
    if(!description || typeof description !== 'string'){
        throw new Error('Description is required');
    }
    const trimmed = description.trim();
    if(!trimmed || typeof trimmed !== 'string' || trimmed.length === 0){
        throw new Error('Description is required');
    }
    if(trimmed.length < 5)
        throw new Error('Description must be at least 5 characters');
    if(trimmed.length > 255){
        throw new Error('Description must not exceed 255 characters');
    }
    const sanitized = validator.escape(trimmed);
    return sanitized;
};

export const validateSeverity = (severityRaw) => {
    const num = Number(severityRaw);
    if(!Number.isInteger(num) || num < 1 || num > 10){
        throw new Error('Severity must be an integer between 1 and 10');
    }
    return num;
};

export const validateStatus = (statusRaw) => {
    const s = (statusRaw || '').toLowerCase();
    if(!VALID_STATUS.includes(s)){
        throw new Error('Invalid status value');
    }
    return s;
};

// const VALID_ISSUES = ['elevator', 'escalator', 'bathroom', 'turnstile', 'other'];
// export const validateReportInput = (data) => {
//     const errors = [];
//     if (!data.stationId || typeof data.stationId !== 'string')
//         errors.push('Invalid station ID');
//     if (!data.stationName || typeof data.stationName !== 'string')
//         errors.push('Invalid station name');
//     if (!VALID_ISSUES.includes(data.issueType))
//         errors.push('Invalid issue type');
//     if (!data.description || data.description.trim().length < 5)
//         errors.push('Description too short');
//     if (errors.length > 0)
//         throw errors.join(', ');
//     return {
//         stationId: data.stationId.trim(),
//         stationName: data.stationName.trim(),
//         issueType: data.issueType,
//         description: data.description.trim(),
//     };
// };