const Card = ({ children, className = '', as: Component = 'section', ...props }) => {
  return (
    <Component
      className={`rounded-2xl border border-line bg-surface shadow-soft ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
};

export default Card;