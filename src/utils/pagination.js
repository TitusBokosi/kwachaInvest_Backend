/**
 * Normalizes page/pageSize into Prisma's skip/take, with sane defaults and
 * an upper bound so nobody can request pageSize=999999 and dump a table.
 */
export const buildPagination = ({ page = 1, pageSize = 20 } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    return {
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        page: safePage,
        pageSize: safePageSize,
    };
}

/** Wraps a findMany result + count into a consistent paginated shape. */
export const paginatedResult = (data, total, page, pageSize) => ({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
})
