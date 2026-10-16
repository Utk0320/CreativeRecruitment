const parseListOptions = (query, sortFields, defaultSort) => {
    const requestedPage = Number.parseInt(query.page, 10);
    const requestedLimit = Number.parseInt(query.limit, 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 100;
    const sort = Object.hasOwn(sortFields, query.sort) ? query.sort : defaultSort;
    const direction = String(query.order || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';

    return {
        page,
        limit,
        offset: (page - 1) * limit,
        sortField: sortFields[sort],
        direction,
        search
    };
};

const setPaginationHeaders = (res, options, total) => {
    res.set({
        'X-Total-Count': String(total),
        'X-Page': String(options.page),
        'X-Limit': String(options.limit),
        'X-Page-Count': String(Math.ceil(total / options.limit))
    });
};

module.exports = { parseListOptions, setPaginationHeaders };