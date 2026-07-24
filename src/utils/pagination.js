export  const buildPagination = ({ page = 1, pageSize = 20 } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return {
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        page: safePage,
        pageSize: safePageSize,
    };
}
export const toPaginatedResult = (data, total, page, pageSize) => ({
    data: data.map(omitSensitive),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
})