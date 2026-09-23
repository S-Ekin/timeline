import './style.scss';

export function Item(props: {
  label?: React.ReactNode;
  children?: React.ReactNode;
}) {
  if (!props.children && !props.label) {
    return null;
  }
  return (
    <div className='form-item'>
      {props.label ? <div className='label'>{props.label}</div> : null}
      <div className='item-content'>{props.children}</div>
    </div>
  );
}
