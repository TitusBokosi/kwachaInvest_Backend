/**
 * Standard success envelope. Usage:
 *   sendSuccess(res, { data: user })                       -> 200, { success, data }
 *   sendSuccess(res, { statusCode: 201, data: user })       -> 201, { success, data }
 *   sendSuccess(res, { message: "Logged out" })             -> 200, { success, message }
 *   sendSuccess(res, { data, total, page, pageSize, ... })  -> paginated list responses
 *     (any extra fields alongside data/message are spread onto the body as-is —
 *      this is how paginated list endpoints attach total/page/pageSize/totalPages)
 */
export const sendSuccess = (res, { statusCode = 200, data, message, ...rest } = {}) => {
    const body = { success: true };
    if (message !== undefined) body.message = message;
    if (data !== undefined) body.data = data;
    Object.assign(body, rest);
    return res.status(statusCode).json(body);
}
