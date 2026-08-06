export const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({ status: 'success', message, data });
};

export const error = (res, statusCode = 500, message = 'Something went wrong', errors = null) => {
  const response = { status: 'error', message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};
