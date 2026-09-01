const validationMiddleware = (schema) => {
  return async (req, res, next) => {
    try {
      const result = await schema.safeParseAsync(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Validation Failed",
          errors: result.error.flatten().fieldErrors,
        });
      }

      req.validatedData = result.data;

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default validationMiddleware;