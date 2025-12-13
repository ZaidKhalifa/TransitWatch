const VALID_ISSUES = ['elevator', 'escalator', 'bathroom', 'turnstile', 'other'];
export const validateReportInput = (data) => {
    const errors = [];
    if (!data.stationId || typeof data.stationId !== 'string')
        errors.push('Invalid station ID');
    if (!data.stationName || typeof data.stationName !== 'string')
        errors.push('Invalid station name');
    if (!VALID_ISSUES.includes(data.issueType))
        errors.push('Invalid issue type');
    if (!data.description || data.description.trim().length < 5)
        errors.push('Description too short');
    if (errors.length > 0)
        throw errors.join(', ');
    return {
        stationId: data.stationId.trim(),
        stationName: data.stationName.trim(),
        issueType: data.issueType,
        description: data.description.trim(),
    };
};