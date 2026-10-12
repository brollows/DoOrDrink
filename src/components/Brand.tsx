import { Link } from 'react-router-dom';

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="DoOrDrink, forsiden">
      <span className="brand-mark">D.</span>
      <span>Do<span className="brand-or">Or</span>Drink<span className="brand-dot">.</span></span>
    </Link>
  );
}
